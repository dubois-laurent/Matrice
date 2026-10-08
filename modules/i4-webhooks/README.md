# I4 - Webhooks & API tierce

## Prérequis

- Python 3.11 ou plus (le code utilise `asyncio.timeout`)

```sh
python --version
```

## Installation

Depuis le dossier `modules/i4-webhook` :

```sh
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

## Lancement

Deux terminaux, depuis `modules/i4-webhook`.

1. Le partenaire simulé (port 8001). Le mode se choisit au démarrage : `ok` (défaut), `flaky`, `down`, `slow` ou `reject`.

```sh
$env:PARTNER_MODE = "flaky"
.\.venv\Scripts\python -m uvicorn partner:app --port 8001
```

2. Le récepteur (port 8000) :

```sh
.\.venv\Scripts\python -m uvicorn main:app --port 8000
```

Routes du récepteur : `GET /health`, `POST /webhooks/planning`, `GET /deliveries/{event_id}`. Documentation interactive : http://127.0.0.1:8000/docs

Les livraisons sont gardées en mémoire : elles sont perdues quand le récepteur redémarre.

## Tests

Le récepteur et le partenaire sont reliés en mémoire : aucun serveur à lancer.

```sh
.\.venv\Scripts\python -m pytest
```

Résultat attendu : `29 passed` (environ 9 secondes, dont 7 pour le test du timeout).

| Scénario du sujet | Tests |
|---|---|
| Signature valide / invalide | `test_valid_signature_is_accepted`, `test_invalid_signature_is_rejected`, `test_body_modified_after_signing_is_rejected`, `test_signature_is_computed_on_the_raw_body` |
| Ancienneté | `test_timestamp_older_than_300_seconds_is_rejected`, `test_timestamp_within_300_seconds_is_accepted` |
| Taille et corps invalide | `test_body_over_64_kb_is_rejected`, `test_authenticated_but_invalid_body_gives_400` |
| Doublon | `test_duplicate_event_is_acknowledged_without_new_delivery` |
| 503 puis succès | `test_503_then_success` |
| Erreur persistante | `test_persistent_503_ends_in_quarantine_after_3_attempts` |
| 400 sans retry | `test_400_is_not_retried` |
| Timeout | `test_slow_partner_triggers_timeout_and_retries` |
| Logs sans secret | `test_logs_never_contain_the_secret_or_the_signature` |

Enregistrer la sortie détaillée dans `preuves/` :

```sh
.\.venv\Scripts\python -m pytest -v > preuves\tests.log 2>&1
```

## Problèmes courants

| Symptôme | Solution |
|---|---|
| `No module named 'fastapi'` | Utiliser `.\.venv\Scripts\python` et relancer `pip install -r requirements.txt` |
| `ModuleNotFoundError: No module named 'main'` | Lancer les commandes depuis `modules/i4-webhook` |
| Le port 8000 ou 8001 est déjà utilisé | Ajouter `--port 8010` et définir `$env:PARTNER_URL = "http://127.0.0.1:8011"` pour le récepteur |