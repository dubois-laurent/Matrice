# B1 - Base de données

## Prérequis

- Docker Desktop (lancé)
- Node.js 20 ou plus et npm

```sh
docker --version
docker ps
node --version
npm --version
```

## Installation

Depuis le dossier `modules/b1-database` :

```sh
npm install
```

Créer le fichier `.env` à partir du modèle (il n'est pas versionné) :

```sh
# PowerShell
Copy-Item .env.example .env

# Bash
cp .env.example .env
```

Les valeurs par défaut de `.env.example` fonctionnent telles quelles. Si tu changes `POSTGRES_USER`, `POSTGRES_PASSWORD` ou `POSTGRES_DB`, reporte les mêmes valeurs dans `DATABASE_URL` :

```env
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:5432/<POSTGRES_DB>?schema=public
```

## Lancement

1. Démarrer PostgreSQL (conteneur Docker) :

```sh
npm run db:up
docker compose ps
```

Attendre que le statut soit `healthy`.

2. Appliquer les migrations et générer le client Prisma :

```sh
npx prisma migrate deploy
npx prisma generate
```

3. Insérer le jeu de données (3 formateurs, séances s01 à s06, acquis) :

```sh
npx prisma db seed
```

Le seed peut être relancé sans créer de doublons.

4. Vérifier le contenu de la base (optionnel) :

```sh
docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "select code, date, period, student_group, mode, status from sessions order by code;"
```

## Tests

La base doit être démarrée et le seed exécuté (étapes 1 à 3 ci-dessus).

```sh
npm test
```

Résultat attendu : `Tests 60 passed (60)`.

| Fichier | Contenu |
|---|---|
| `tests/operations.test.ts` | Les 5 opérations (créer une séance, lister une semaine avec les formateurs, confirmer une affectation, heures par formateur, acquis validés) et le refus des entrées invalides |
| `tests/concurrency.test.ts` | Plusieurs connexions simultanées : un formateur ne peut pas être affecté deux fois au même créneau |
| `tests/constraints.test.ts` | Ce que PostgreSQL refuse seul, en SQL brut (enums, clés étrangères, `NOT NULL`, unicité) |

Autres commandes :

```sh
# Relancer les tests à chaque modification
npm run test:watch

# Un seul fichier
npx vitest run tests/concurrency.test.ts

# Enregistrer la sortie détaillée dans preuves/
npm run test:preuves
```

Les tests créent leurs propres séances (codes commençant par `x`, `c` ou `d`) et les suppriment à la fin : les données du seed ne sont pas modifiées.

## Arrêt et remise à zéro

```sh
# Arrêter le conteneur (les données sont conservées)
npm run db:down

# Tout supprimer, volume compris, puis repartir de zéro
npm run db:reset
npm run db:up
npx prisma migrate deploy
npx prisma db seed
```
