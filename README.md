# Projet Matrice

MATRiCE organise des séances de formation par date, demi-journée, groupe et formateur. L'application
permet de consulter le planning, le détail d'une séance, les affectations et les acquis.

Dans ce contexte, je présente 3 modules fonctionnels et indépendants de chacuns.

## Les modules

Chaque module est dans son dossier, se lance et se teste seul, et ne dépend d'aucun autre.

Chaque dossier contient :

- `README.md` : prérequis, installation, lancement et tests du module ;
- `JUSTIFICATIONS.md` : choix techniques, alternatives, preuves et limites ;
- `SOURCES_IA.md` : usages de l'IA ;
- `preuves/` : sorties des tests et mesures.

Le diagramme de la base de données (B1) est dans [diagramme.png](diagramme.png).

## Prérequis

```sh
git --version
node --version
npm --version
docker --version
python --version
```

## Récupérer le projet

```sh
git clone https://github.com/dubois-laurent/Matrice.git
cd Matrice
```

## Lancement et tests, module par module

Les commandes ci-dessous sont un résumé. Le détail (variables d'environnement, problèmes courants) est dans le `README.md` de chaque module.

### B1 - Base de données

```sh
cd modules/b1-database
npm install
Copy-Item .env.example .env
npm run db:up
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
npm test
```

Résultat attendu : `Tests 60 passed (60)`.

### I1 - Auto-tagging

```sh
cd modules/i1-autotagging
npm install
npm test
npm run tag -- "Détecter le phishing"
npm run evaluate
```

Résultat attendu : `Tests 13 passed (13)` et `Exactitude : 8/8`.

### I4 - Webhooks & API tierce

```sh
cd modules/i4-webhooks
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m pytest
```

Résultat attendu : `29 passed`. Les tests relient le récepteur et le partenaire en mémoire, aucun serveur à lancer.

## Sécurité et données

- Aucun secret n'est versionné : les fichiers `.env` sont ignorés, seul `.env.example` (valeurs d'exemple) est présent.
- Le secret `matrice-local-only` du module I4 est fourni par le sujet et n'a aucune valeur réelle.
- Les dépendances installées (`node_modules/`, `.venv/`) ne sont pas versionnées.
- Les données (formateurs, séances, acquis) sont fictives.

## Usage de l'IA

Les usages de l'IA sont déclarés module par module dans les fichiers `SOURCES_IA.md`.

Dubois Laurent