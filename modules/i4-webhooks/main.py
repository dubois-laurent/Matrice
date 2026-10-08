import asyncio
import datetime as dt
import hashlib
import hmac
import logging
import os
import re
import time
from typing import Annotated, Literal

import httpx
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints, ValidationError, model_validator

# Le secret est celui du sujet
SECRET = os.getenv("WEBHOOK_SECRET", "matrice-local-only")
PARTNER_URL = os.getenv("PARTNER_URL", "http://127.0.0.1:8001")
MAX_BODY = 64 * 1024  # octets
MAX_SKEW = 300  # secondes
TIMEOUT = 2.0  # secondes, par tentative
MAX_ATTEMPTS = 3
BACKOFF = (0.2, 0.4)  # attente avant la 2e puis la 3e tentative

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("webhook")

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Session(BaseModel):
    model_config = ConfigDict(strict=True)

    id: NonEmpty
    date: dt.date
    period: Literal["am", "pm"]
    group: Literal["A", "B", "Promotion"]
    mode: Literal["DG", "CE", "AUTO"]
    title: NonEmpty
    domain: Literal["web", "data", "cyber", "projet"]
    teacherId: NonEmpty | None = None
    status: Literal["proposed", "confirmed"]

    @model_validator(mode="after")
    def business_rules(self) -> "Session":
        if self.mode == "AUTO" and (self.teacherId is not None or self.status != "proposed"):
            raise ValueError("une séance AUTO n'a pas de formateur et reste au statut proposed")
        if self.status == "confirmed" and self.teacherId is None:
            raise ValueError("une séance confirmée doit avoir un formateur")
        return self


class PlanningEvent(BaseModel):
    model_config = ConfigDict(strict=True)

    event_id: NonEmpty
    type: Literal["session.updated"]
    occurred_at: AwareDatetime  # ISO 8601 avec fuseau obligatoire
    session: Session


def sign(secret: str, timestamp: str, body: bytes) -> str:
    # Message = timestamp + "." + corps brut, tel que reçu : on ne re-sérialise jamais le JSON.
    return "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


async def try_once(payload: dict, event_id: str, transport, timeout: float) -> tuple[str, str]:
    """Une tentative d'envoi au partenaire. Retourne ("ok" | "retry" | "fail", détail)."""
    try:
        async with asyncio.timeout(timeout):
            async with httpx.AsyncClient(base_url=PARTNER_URL, transport=transport) as client:
                response = await client.post("/tickets", json=payload, headers={"Idempotency-Key": event_id})
    except TimeoutError:
        return "retry", "timeout"
    except httpx.TransportError as error:
        return "retry", type(error).__name__

    code = response.status_code
    if response.is_success:
        return "ok", str(code)
    if code == 429 or code >= 500:
        return "retry", str(code)
    return "fail", str(code)  # autre 4xx : réessayer ne servirait à rien


async def deliver(record: dict, event_id: str, payload: dict, transport, timeout: float) -> None:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        record["attempts"] = attempt
        outcome, detail = await try_once(payload, event_id, transport, timeout)
        log.info("livraison event_id=%s tentative=%d résultat=%s (%s)", event_id, attempt, outcome, detail)
        if outcome == "ok":
            record["status"] = "delivered"
            return
        if outcome == "fail":
            break
        if attempt < MAX_ATTEMPTS:
            await asyncio.sleep(BACKOFF[attempt - 1])
    record["status"] = "quarantine"
    log.warning("livraison event_id=%s en quarantaine après %d tentative(s)", event_id, record["attempts"])


def create_app(partner_transport: httpx.AsyncBaseTransport | None = None, timeout: float = TIMEOUT) -> FastAPI:
    app = FastAPI(title="MATRiCE - récepteur de webhooks")
    # Mémoire locale : tout est perdu au redémarrage du serveur (limite documentée dans le README).
    deliveries: dict[str, dict] = {}

    def refuse(status: int, reason: str, detail=None) -> JSONResponse:
        log.warning("webhook refusé status=%d raison=%s", status, reason)
        return JSONResponse({"error": reason, **({"detail": detail} if detail else {})}, status_code=status)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/webhooks/planning")
    async def planning(request: Request, background: BackgroundTasks):
        # 1. Taille
        if request.headers.get("content-length", "").isdigit() and int(request.headers["content-length"]) > MAX_BODY:
            return refuse(413, "corps trop volumineux")
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_BODY:
                return refuse(413, "corps trop volumineux")

        # 2. Authentification : timestamp récent, puis signature du corps brut
        timestamp = request.headers.get("x-timestamp", "")
        signature = request.headers.get("x-signature", "")
        if not re.fullmatch(r"\d{1,12}", timestamp):
            return refuse(401, "X-Timestamp absent ou invalide")
        if abs(time.time() - int(timestamp)) > MAX_SKEW:
            return refuse(401, "timestamp trop ancien ou trop éloigné")
        if not hmac.compare_digest(sign(SECRET, timestamp, body).encode(), signature.encode()):
            return refuse(401, "signature invalide")

        # 3. Contenu : seulement une fois l'appelant authentifié
        try:
            event = PlanningEvent.model_validate_json(body)
        except ValidationError as exc:
            # emplacement et message seulement, jamais la valeur reçue
            problems = [{"champ": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]
            return refuse(400, "corps invalide", problems)

        # 4. Doublon. Aucun await entre la lecture et l'écriture : deux requêtes simultanées ne passent pas toutes les deux.
        if event.event_id in deliveries:
            log.info("webhook doublon event_id=%s : aucune nouvelle livraison", event.event_id)
            return JSONResponse({"event_id": event.event_id, "duplicate": True}, status_code=200)

        record = {"status": "pending", "attempts": 0}
        deliveries[event.event_id] = record
        background.add_task(deliver, record, event.event_id, event.model_dump(mode="json"), partner_transport, timeout)
        log.info("webhook accepté event_id=%s", event.event_id)
        return JSONResponse({"event_id": event.event_id, "duplicate": False}, status_code=202)

    @app.get("/deliveries/{event_id}")
    def get_delivery(event_id: str):
        if event_id not in deliveries:
            return JSONResponse({"error": "livraison inconnue"}, status_code=404)
        return {"event_id": event_id, **deliveries[event_id]}

    return app


app = create_app()