### Intro

J'ai demandé à l'IA de me faire un cachier des charges pour chaques modules afin d'optimiser mon temps.


## Commit 1 🚧 Initialisation des dépendances Prisma / Docker PostgreSQL

# Contenus générés par GTP Codex 5.3 dans ce commit :

- Package.json

## Commit 2 🚑 Régréssion de la version PostgreSQL latest ===> PostgreSQL 16 / DB OK ! ✅

Pas de contenus touchés dans ce commit, je me suis embrouillé tout seul au niveau des ports + postgres:latest dans mon fichier compose me donnait une erreur du coup je me suis mis en 16-alpine pour fixer le soucis.

## Commit 3 Schema Prisma et migration initiale

# Contenus générés par GTP Codex 5.3 dans ce commit :

- tsconfig.json

# Contenus vérifiés par Claude dans ce commit :

- prisma/schema.prisma (Voir ligne 116 de JUSTIFICATIONS.md, J'ai conversé avec Claude pour ce problème.)

## Commit 4 🌱 Seeding

RAS

## Commit 5 🧪 Operations / Zod / Vitest

# Contenus générés par Claude dans ce commit :

- src/schemas.ts 
- tests/operations.test.ts

# Contenus vérifiés et corrigés :

- src/operations.ts (Voir ligne 232 de JUSTIFICATIONS.md)

## Commit 6 🧪 Concurrency / Constraints

# Contenus générés :

- tests/concurrency.test.ts
- tests/constraints.test.ts

L'IA fait les tests parfaitement.. Et Vitest est simple à lire donc je me suis permis.

## Commit 7 

RAS



