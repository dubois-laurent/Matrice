## 1 // Stacks techniques

- PostgreSQL
- Docker
- Node.js / Prisma / Typescript


## 2 // Mon Cheminement de pensée

J'ai choisi de partir sur une base PostgreSQL gérée dans un conteneur docker.

Afin d'itérer sur cette base, j'ai préféré me pencher sur du Node.js, et plus précisémment, j'ai souhaité utiliser l'ORM Prisma étant donné que j'ai déjà utilisé ce ORM plusieurs fois auparavant.

# Pourquoi Prisma ?

C'est un ORM super sympa qui permet de gérer une BDD de manière simplifiée en représentant les tables sous forme d'objets Javascript typés !

C'est super intuitif, l'ORM touche 3 gros morceaux : le schéma, les migrations et le client

- Prisma.schema : Seul et unique fichier qui décrit les tables et les relations.

- Migrations : L'ORM compare le schéma avec la base de donnée et met à jour automatiquement en générant automatiquement les requëtes SQL lui même.

- Prisma.client : Il est généré automatiquement depuis le schéma. C’est lui que j'utilise dans le code pour faire des requêtes. Il est entièrement typé bien sûr.

# Commit 2 - Régréssion de la version PostgreSQL latest ===> PostgreSQL 16 // 

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








