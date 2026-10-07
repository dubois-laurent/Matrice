### 1 // Stacks techniques

- Nodejs / Zod / Vitest / Typescript

### 2 // Plan d'implémentation

## Introduction

Normalement j'aurai du faire ce module en C#, cependant je suis dans un contexte géographique ayant une connexion internet très limitée actuellement (Nord de la Thailande / Lampang). Ayant réussi à télécharger Node 4 jours avant, je me permet donc je rester dessus.

## Commit 1 🎉 Commit initial / Corpus / npm

Construction du projet, implémentation du jeu de donnée en JSON.

## Commit 2 

**classify.ts** : 

J'ai commencé par définir et sélectionner les mots clés courants dans les titres, après avoir normalisé ces derniers.
Ensuite je les ai classé par catégories:
 - web: react, composant, propriet, css, style, responsive
 - data:  sql, jointure, requet, csv, nettoyage, donnee
 - cyber: authentif, droit, phishing

 Après, j'ai itéré une fonction simple qui prend en paramètre le texte normalisé en paramètre, ce dernier passe par 3 conditions, et me retourne soit le domaine lié au texte, soit s'abtient car pas assez précis ou pas de donnée.

 **cli.ts** :

 Smple fichier afin de créer un script utilisant le fonction classify en entrant un texte personnalisé.

 Ci-dessous deux exemples distincts :

 ```sh
 PS C:\Users\wtzmo\code\Matrice\modules\i1-autotagging> npm run tag -- "Composants React et propriétés"

> i1-autotagging@1.0.0 tag
> tsx src/cli.ts Composants React et propriétés

{
  "texte": "Composants React et propriétés",
  "categorie": "web",
  "motif": "mots-clés react, composant, propriet"
}
PS C:\Users\wtzmo\code\Matrice\modules\i1-autotagging> npm run tag -- "React et protection contre le phishing"

> i1-autotagging@1.0.0 tag
> tsx src/cli.ts React et protection contre le phishing

{
  "texte": "React et protection contre le phishing",
  "categorie": "a_revoir",
  "motif": "ambigu : web (react) et cyber (phishing)"
}
```



