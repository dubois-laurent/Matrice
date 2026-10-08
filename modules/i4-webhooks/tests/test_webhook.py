import json
import logging
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from main import SECRET, create_app, sign
from partner import create_partner

SESSION = {
    "id": "s04", "date": "2026-10-20", "period": "am", "group": "A", "mode": "DG",
    "title": "Authentification", "domain": "cyber", "teacherId": "t2", "status": "confirmed",
}


def make_event(event_id="evt-1", **session_changes):
    return {
        "event_id": event_id,
        "type": "session.updated",
        "occurred_at": "2026-10-20T08:30:00+02:00",
        "session": {**SESSION, **session_changes},
    }


def post_webhook(client, body, timestamp=None, signature=None, secret=SECRET):
    """Envoie un webhook signé. `body` : dict ou bytes (envoyés tels quels, sans re-sérialiser)."""
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    ts = str(int(time.time())) if timestamp is None else str(timestamp)
    sig = sign(secret, ts, raw) if signature is None else signature
    return client.post("/webhooks/planning", content=raw, headers={"X-Timestamp": ts, "X-Signature": sig})


class Env:
    """Récepteur + partenaire simulé, reliés en mémoire (pas de port réseau)."""

    def __init__(self, mode="ok", **partner_options):
        self.partner = create_partner(mode, **partner_options)
        self.client = TestClient(create_app(partner_transport=httpx.ASGITransport(app=self.partner)))

    def delivery(self, event_id):
        return self.client.get(f"/deliveries/{event_id}")


# --- Récepteur : sécurité ---------------------------------------------------


def test_health():
    response = Env().client.get("/health")
    assert (response.status_code, response.json()) == (200, {"status": "ok"})


def test_valid_signature_is_accepted():
    response = post_webhook(Env().client, make_event())
    assert response.status_code == 202
    assert response.json() == {"event_id": "evt-1", "duplicate": False}


def test_signature_is_computed_on_the_raw_body():
    # Espaces et ordre des clés inhabituels : re-sérialiser le JSON changerait la signature
    raw = b'{ "type" : "session.updated",\n "event_id":"evt-raw",\n "occurred_at":"2026-10-20T08:30:00Z",\n "session": ' + json.dumps(SESSION, indent=3).encode() + b"}"
    assert post_webhook(Env().client, raw).status_code == 202


@pytest.mark.parametrize("case", ["mauvais secret", "signature modifiée", "signature vide"])
def test_invalid_signature_is_rejected(case):
    env = Env()
    ts = str(int(time.time()))
    raw = json.dumps(make_event()).encode()
    signature = {
        "mauvais secret": sign("autre-secret", ts, raw),
        "signature modifiée": sign(SECRET, ts, raw)[:-1] + "0",
        "signature vide": "",
    }[case]
    assert post_webhook(env.client, raw, timestamp=ts, signature=signature).status_code == 401
    assert env.delivery("evt-1").status_code == 404  # rien n'a été enregistré


def test_body_modified_after_signing_is_rejected():
    ts = str(int(time.time()))
    signed = json.dumps(make_event(title="Authentification")).encode()
    tampered = json.dumps(make_event(title="Piratage")).encode()
    assert post_webhook(Env().client, tampered, timestamp=ts, signature=sign(SECRET, ts, signed)).status_code == 401


@pytest.mark.parametrize("offset", [-301, 301, -3600])
def test_timestamp_older_than_300_seconds_is_rejected(offset):
    assert post_webhook(Env().client, make_event(), timestamp=int(time.time()) + offset).status_code == 401


def test_timestamp_within_300_seconds_is_accepted():
    assert post_webhook(Env().client, make_event(), timestamp=int(time.time()) - 290).status_code == 202


def test_body_over_64_kb_is_rejected():
    raw = json.dumps(make_event(title="x" * 70_000)).encode()
    assert post_webhook(Env().client, raw).status_code == 413


# --- Récepteur : contenu ----------------------------------------------------


@pytest.mark.parametrize(
    "mutation",
    [
        lambda e: e.pop("event_id"),
        lambda e: e.update(event_id=""),
        lambda e: e.update(type="session.deleted"),
        lambda e: e.update(occurred_at="2026-10-20T08:30:00"),  # sans fuseau
        lambda e: e["session"].update(period="soir"),
        lambda e: e["session"].update(mode="AUTO", teacherId="t1", status="proposed"),
        lambda e: e["session"].update(status="confirmed", teacherId=None),
    ],
    ids=["event_id absent", "event_id vide", "mauvais type", "occurred_at sans fuseau", "période inconnue",
         "AUTO avec formateur", "confirmée sans formateur"],
)
def test_authenticated_but_invalid_body_gives_400(mutation):
    env = Env()
    event = make_event()
    mutation(event)
    assert post_webhook(env.client, event).status_code == 400
    assert env.partner.state.attempts == {}  # rien n'est parti vers le partenaire


def test_authenticated_non_json_body_gives_400():
    assert post_webhook(Env().client, b"pas du json").status_code == 400


# --- Doublons ---------------------------------------------------------------


def test_duplicate_event_is_acknowledged_without_new_delivery():
    env = Env()
    first = post_webhook(env.client, make_event("evt-dup"))
    second = post_webhook(env.client, make_event("evt-dup"))

    assert (first.status_code, first.json()["duplicate"]) == (202, False)
    assert (second.status_code, second.json()["duplicate"]) == (200, True)
    assert env.partner.state.attempts == {"evt-dup": 1}  # une seule requête vers le partenaire


def test_unknown_delivery_gives_404():
    assert Env().delivery("inconnu").status_code == 404


# --- Livraison au partenaire ------------------------------------------------


def test_delivery_ok():
    env = Env("ok")
    post_webhook(env.client, make_event("evt-ok"))
    assert env.delivery("evt-ok").json() == {"event_id": "evt-ok", "status": "delivered", "attempts": 1}
    assert env.partner.state.tickets["evt-ok"]["idempotency_key"] == "evt-ok"


def test_503_then_success():
    env = Env("flaky")
    started = time.monotonic()
    post_webhook(env.client, make_event("evt-flaky"))
    assert env.delivery("evt-flaky").json() == {"event_id": "evt-flaky", "status": "delivered", "attempts": 2}
    assert time.monotonic() - started >= 0.2  # attente de 0,2 s avant la 2e tentative
    assert len(env.partner.state.tickets) == 1


def test_persistent_503_ends_in_quarantine_after_3_attempts():
    env = Env("down")
    started = time.monotonic()
    post_webhook(env.client, make_event("evt-down"))
    assert env.delivery("evt-down").json() == {"event_id": "evt-down", "status": "quarantine", "attempts": 3}
    assert 0.6 <= time.monotonic() - started < 1.5  # 0,2 s + 0,4 s d'attente


def test_400_is_not_retried():
    env = Env("reject")
    post_webhook(env.client, make_event("evt-reject"))
    assert env.delivery("evt-reject").json() == {"event_id": "evt-reject", "status": "quarantine", "attempts": 1}
    assert env.partner.state.attempts == {"evt-reject": 1}


def test_slow_partner_triggers_timeout_and_retries():
    # Valeurs du contrat : timeout 2 s, partenaire qui répond après 3 s, 3 tentatives (environ 6,6 s)
    env = Env("slow")
    started = time.monotonic()
    post_webhook(env.client, make_event("evt-slow"))
    assert env.delivery("evt-slow").json() == {"event_id": "evt-slow", "status": "quarantine", "attempts": 3}
    assert 6.5 <= time.monotonic() - started < 8.5
    # Le partenaire a créé le ticket mais trop tard : l'idempotence évite les doublons
    assert len(env.partner.state.tickets) == 1
    assert env.partner.state.attempts == {"evt-slow": 3}


def test_partner_creates_one_ticket_per_idempotency_key():
    client = TestClient(create_partner())
    first = client.post("/tickets", json={}, headers={"Idempotency-Key": "k1"})
    again = client.post("/tickets", json={}, headers={"Idempotency-Key": "k1"})
    other = client.post("/tickets", json={}, headers={"Idempotency-Key": "k2"})
    assert (first.status_code, again.status_code, other.status_code) == (201, 200, 201)
    assert first.json() == again.json() != other.json()


# --- Logs -------------------------------------------------------------------


def test_logs_never_contain_the_secret_or_the_signature(caplog):
    caplog.set_level(logging.DEBUG)
    env = Env("flaky")
    ts = str(int(time.time()))
    raw = json.dumps(make_event("evt-log")).encode()
    signature = sign(SECRET, ts, raw)

    post_webhook(env.client, raw, timestamp=ts, signature=signature)  # accepté
    post_webhook(env.client, raw, timestamp=ts, signature="sha256=" + "0" * 64)  # signature invalide

    assert "evt-log" in caplog.text
    assert SECRET not in caplog.text
    assert signature not in caplog.text
    assert "Authentification" not in caplog.text  # le contenu de la séance non plus