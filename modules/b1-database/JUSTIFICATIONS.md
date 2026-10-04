### 1 // Stacks techniques

- PostgreSQL
- Docker
- Node.js / Prisma / Typescript / Zod / Vitest


### 2 // Plan d'implémentation 

## Introduction

J'ai choisi de partir sur une base PostgreSQL gérée dans un conteneur docker. Pour le projet je trouve qu'une base de donnée relationnelle est bien plus pratique toutes les données à gérer sont presque toutes reliées (formateur, semaine, séance, etc..). Or PostgreSQL applique déjà elle-même les règles et gère les transactions (clés étrangères).

Afin d'itérer sur cette base, j'ai préféré me pencher sur du Node.js, et plus précisémment, j'ai souhaité utiliser l'ORM Prisma étant donné que j'ai déjà utilisé ce ORM plusieurs fois auparavant.

## Pourquoi Prisma ?

C'est un ORM super sympa, découvert l'année dernière lors d'un stage, qui permet de gérer une BDD de manière simplifiée en représentant les tables sous forme d'objets Javascript typés en gros.

C'est super intuitif, l'ORM touche 3 gros morceaux : le schéma, les migrations et le client

- Prisma.schema : Seul et unique fichier qui décrit les tables et les relations.

- Migrations : L'ORM compare le schéma avec la base de donnée et met à jour automatiquement en générant automatiquement les requëtes SQL lui même.

- Prisma.client : Il est généré automatiquement depuis le schéma. C’est lui que j'utilise dans le code pour faire des requêtes. Il est entièrement typé bien sûr.

## Commit 2 - Régréssion de la version PostgreSQL latest ===> PostgreSQL 16 //

Pas trop d'explications pour le Commit 1 donc on commence par le second.

- J'ai commencé par généré les fichiers de config prisma via "npx prisma init" :

```sh

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> npx prisma init
Loaded Prisma config from prisma7.config.ts.

✔ Skills installed

Initialized Prisma in your project

  prisma/
    schema.prisma
  prisma7.config.ts
  .claude/skills/ // supprimé par la suite car pollue le projet // sert à rien 
  .windsurf/skills/ // supprimé par la suite
  .agents/skills/ // supprimé par la suite
  skills-lock.json // supprimé par la suite

warn Prisma would have added DATABASE_URL but it already exists in .env.
warn You already have a .gitignore file. Don't forget to add .env in it to not commit any private information.

Next, choose how you want to set up your database:

CONNECT EXISTING DATABASE:
  1. Configure your DATABASE_URL in prisma7.config.ts
  2. Run prisma db pull to introspect your database.

CREATE NEW DATABASE:
  Local: npx prisma dev (runs Postgres locally in your terminal)
  Cloud: npx create-db (creates a free Prisma Postgres database)

Then, define your models in prisma/schema.prisma and run prisma migrate dev to apply your schema.

Learn more: https://pris.ly/getting-started

```

- Ensuite je teste de démmarrer mon conteneur Docker, puis je regarde si il est healthy en me connectant dessus localement et en faisant une commande simple (select version();) :

```sh

docker compose up -d
docker compose ps
docker compose exec postgres psql -U lolo -d matrice_b1 -c "select version();"

```

- ça donne :

```sh

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> docker compose up -d  
[+] up 17/17
 ✔ Image postgres:16-alpine                   Pulled                                              21.8s
 ✔ Network b1-database_default                Created                                              0.0s
 ✔ Volume b1-database_postgres_data_module_b1 Created                                              0.0s
 ✔ Container postgres_container_module_b1     Started                                              0.4s
PS C:\Users\wtzmo\code\Matrice\modules\b1-database> docker compose ps
NAME                           IMAGE                COMMAND                  SERVICE    CREATED      STATUS                        PORTS
postgres_container_module_b1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   About a minuteago   Up About a minute (healthy)   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
PS C:\Users\wtzmo\code\Matrice\modules\b1-database> docker compose exec postgres psql -U lolo -d matrice_b1 -c "select version();"
                                         version                                          
------------------------------------------------------------------------------------------
 PostgreSQL 16.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
(1 row)

```

## Commit 3 - Itération du schema.prisma

Voir le **diagramme.png** pour plus de visibilités.

# Modèle de données

4 tables : `teachers`, `weeks`, `sessions`, `acquis`.


# Cardinalités et clés

- 1 semaine contient N séances (1,N -> 1,1).
- 1 formateur peut avoir 0 à N séances. Le lien est optionnel côté séance : une séance `proposed` ou en mode `AUTO` n'a pas de formateur.
- 1 séance a 0 à N acquis. Si la séance est supprimée, ses acquis le sont aussi (`onDelete: Cascade`). À l'inverse, on ne peut pas supprimer une semaine ou un formateur encore utilisé (`onDelete: Restrict`).

Au départ les identifiants du sujet (`t1`, `s01`...) étaient mes clés primaires en `String`. J'ai vu que c'était faisable dans un autre de mes projets persos mais j'ai du revenir sur du classique. Je les ai remplacés par :

- `id Int @id @default(autoincrement())` : clé technique, c'est elle qui sert aux clés étrangères ;
- `code String @unique` : identifiant fonctionnel du sujet (`t1`, `s01`...).

Pourquoi ? :

- Créer une séance ne demande pas d'inventer un identifiant : sous concurrence, générer `s07` côté code risquerait des collisions, alors que l'auto-incrément est géré par PostgreSQL. De plus la clé étrangère reste indépendante.

# Valeurs autorisées (enums PostgreSQL)

Prenons la table StudentGroup en exemple :

```js
enum StudentGroup {
  A
  B
  Promotion

  @@map("student_group")
}
``` 

Ce sont de vrais types PostgreSQL (`@@map`) : la base refuse toute autre valeur si ce n'est pas "A", "B" ou "Promotion", sans code applicatif.

# Index

*- Index : Usage*

`sessions (week_id, date, period)` : Lister les séances d'une semaine, déjà triées par date puis période

`sessions (teacher_id, date, period)` : Garantir l'unicité du créneau, et retrouver les séances d'un formateur (heures par formateur)

`acquis (session_id)` : Retrouver les acquis d'une séance

## Execution de la migration initiale et vérification :

```sh

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> npx prisma migrate dev --name init
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma.
Datasource "db": PostgreSQL database "matrice_b1", schema "public" at "localhost:5432"

Applying migration `20261003155337_init`

The following migration(s) have been created and applied from new schema changes:

prisma\migrations/
  └─ 20261003155337_init/
    └─ migration.sql

Your database is now in sync with your schema.

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> npx prisma generate
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma.

✔ Generated Prisma Client (7.10.0) to .\generated\prisma in 53ms

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> docker compose exec postgres psql -U lolo -d matrice_b1 -c "\d sessions"
                                           Table "public.sessions"
    Column     |              Type              | Collation | Nullable |               Default       
---------------+--------------------------------+-----------+----------+--------------------------------------
 id            | integer                        |           | not null | nextval('sessions_id_seq'::regclass)
 code          | text                           |           | not null | 
 week_id       | integer                        |           | not null | 
 date          | date                           |           | not null | 
 period        | period                         |           | not null | 
 student_group | student_group                  |           | not null | 
 mode          | mode                           |           | not null | 
 title         | text                           |           | not null | 
 domain        | domain                         |           | not null | 
 teacher_id    | integer                        |           |          | 
 status        | session_status                 |           | not null | 'proposed'::session_status
 created_at    | timestamp(3) without time zone |           | not null | CURRENT_TIMESTAMP
Indexes: 
    "sessions_pkey" PRIMARY KEY, btree (id)
    "sessions_code_key" UNIQUE, btree (code)
    "sessions_teacher_id_date_period_key" UNIQUE, btree (teacher_id, date, period)
    "sessions_week_id_date_period_idx" btree (week_id, date, period)
Foreign-key constraints:
    "sessions_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON UPDATE CASCADE ON DELETE RESTRICT
    "sessions_week_id_fkey" FOREIGN KEY (week_id) REFERENCES weeks(id) ON UPDATE CASCADE ON DELETE RESTRICT     
Referenced by:
    TABLE "acquis" CONSTRAINT "acquis_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON UPDATE CASCADE ON DELETE CASCADE

```

## Commit 4 🌱 Seeding

J'ai récupéré le jeu de données fourni pour l'insérer dans la base. 

Voir le fichier **prisma/seed.ts**.

Afin de pouvoir éxécuter la commande *npx prisma db seed* , J'ai ajouter un script "seed" dans le fichier **prisma.config.ts** afin de lancer *prima/seed.ts* via **tsx** (runtime)

```sh

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> npx prisma db seed
Loaded Prisma config from prisma.config.ts.

Running seed command `tsx prisma/seed.ts` ...
Test seed : 3 formateurs, 6 sessions, 5 acquis
Seed OK.

The seed command has been executed.

```

## Commit 5 

Ajout des opérations **src/operation.ts**, des validators zod **src/schemas.ts** et des tests vitest **tests/operations.test.ts**

J'ai eu quelques soucis au niveau de la date lorsque je créais des nouvelles sessions. Cela créait une toute nouvelle semaine selon la date entrée dans la session : Je ne pouvais pas retrouver la séance dans la semaine originale. Claude m'a éclaircit à ce sujet.

```sh

PS C:\Users\wtzmo\code\Matrice\modules\b1-database> npm test

> b1-database@1.0.0 test
> vitest run


 RUN  v5.0.3 C:/Users/wtzmo/code/Matrice/modules/b1-database

 ✓ tests/operations.test.ts (39 tests) 1296ms
   ✓ créer une séance (3)
     ✓ crée une séance proposée avec son formateur 99ms
     ✓ accepte une séance AUTO sans formateur 33ms
     ✓ rattache la séance au lundi de sa semaine 37ms
   ✓ lister la semaine avec les formateurs (5)
     ✓ retourne les séances du seed avec leur formateur 22ms
     ✓ donne la même semaine quel que soit le jour demandé 18ms
     ✓ groupe A : séances A + Promotion 18ms
     ✓ groupe B : séances B + Promotion 11ms
     ✓ trie par date puis par période 11ms
   ✓ confirmer une affectation (5)
     ✓ confirme une séance dont le formateur est déjà assigné 78ms
     ✓ affecte un formateur au moment de confirmer 59ms
     ✓ refuse de confirmer sans formateur 45ms
     ✓ refuse de confirmer une séance AUTO 11ms
     ✓ refuse une séance ou un formateur inconnu 16ms
   ✓ un formateur ne peut pas avoir 2 séances sur le même créneau (3)
     ✓ refuse la création d'une 2e séance au même créneau 83ms
     ✓ refuse la confirmation qui créerait un conflit 44ms
     ✓ autorise le même formateur sur une autre période 59ms
   ✓ heures par formateur (3)
     ✓ compte 4 h par séance confirmée 104ms
     ✓ ne compte pas les séances proposées 9ms
     ✓ retourne 0 h pour une semaine sans séance 4ms
   ✓ acquis validés (3)
     ✓ ne retourne que les acquis validés, avec leur date 55ms
     ✓ sans filtre, retourne les acquis validés de toutes les séances 7ms
     ✓ un acquis non validé n'a pas de date de validation 4ms
   ✓ entrées invalides refusées (17)
     ✓ période inconnue 4ms
     ✓ groupe inconnu 3ms
     ✓ mode inconnu 3ms
     ✓ domaine inconnu 5ms
     ✓ date impossible 4ms
     ✓ date au mauvais format 5ms
     ✓ titre vide 4ms
     ✓ code vide 4ms
     ✓ champs manquants 5ms
     ✓ entrée qui n'est pas un objet 5ms
     ✓ AUTO avec formateur 5ms
     ✓ AUTO déjà confirmée 3ms
     ✓ confirmée sans formateur 4ms
     ✓ formateur inconnu 7ms
     ✓ code déjà utilisé 24ms
     ✓ refuse un acquis au libellé vide ou sur une séance inconnue 5ms
     ✓ refuse une semaine invalide 1ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  08:34:34
   Duration  2.38s (tests 65%, import 22%, transform 13%, worker 1%)

   ```