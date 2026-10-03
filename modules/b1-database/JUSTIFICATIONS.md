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

- Prisma.client : Il est généré automatiquement depuis le schéma. C’est lui que j'utilise dans le code pour faire des requêtes. Il est entièrement typé bien sûr




