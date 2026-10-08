import asyncio
import os

from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse

MODES = {"ok", "flaky", "down", "slow", "reject"}


def create_partner(mode: str = "ok", slow_delay: float = 3.0) -> FastAPI:
    """Partenaire simulé. Mode choisi au démarrage : PARTNER_MODE=flaky uvicorn partner:app --port 8001"""
    assert mode in MODES, f"mode inconnu : {mode}"
    app = FastAPI(title="MATRiCE - partenaire simulé")
    app.state.attempts = {}  # Idempotency-Key -> nombre de requêtes reçues
    app.state.tickets = {}  # Idempotency-Key -> ticket créé

    @app.post("/tickets")
    async def create_ticket(payload: dict, idempotency_key: str | None = Header(default=None)):
        if not idempotency_key:
            return JSONResponse({"error": "en-tête Idempotency-Key manquant"}, status_code=400)

        count = app.state.attempts.get(idempotency_key, 0) + 1
        app.state.attempts[idempotency_key] = count

        if mode == "down":
            return JSONResponse({"error": "service indisponible"}, status_code=503)
        if mode == "reject":
            return JSONResponse({"error": "requête refusée"}, status_code=400)
        if mode == "flaky" and count == 1:
            return JSONResponse({"error": "panne temporaire"}, status_code=503)

        # Idempotence : une même clé ne crée jamais deux tickets
        ticket = app.state.tickets.get(idempotency_key)
        created = ticket is None
        if created:
            ticket = {"ticket_id": f"tk-{len(app.state.tickets) + 1}", "idempotency_key": idempotency_key}
            app.state.tickets[idempotency_key] = ticket

        # "slow" : le ticket est créé, mais la réponse arrive trop tard pour l'appelant
        if mode == "slow":
            await asyncio.sleep(slow_delay)

        return JSONResponse(ticket, status_code=201 if created else 200)

    return app


app = create_partner(os.getenv("PARTNER_MODE", "ok"))