# I1 - Auto-tagging / catégorisation

## Prérequis

- Node.js 20 ou plus et npm

```sh
node --version
npm --version
```

## Installation

Depuis le dossier `modules/i1-autotagging` :

```sh
npm install
```

## Lancement

Classer un titre de séance (catégorie et motif) :

```sh
npm run tag -- "Détecter le phishing"
```

Résultat attendu :

```json
{
  "texte": "Détecter le phishing",
  "categorie": "cyber",
  "motif": "mots-clés phishing"
}
```

Les catégories possibles sont `web`, `data`, `cyber` et `a_revoir` (le programme s'abstient : texte vide, aucun mot-clé connu, ou plusieurs domaines à la fois).

Exemples :

```sh
npm run tag -- "Composants React et propriétés"
npm run tag -- "React et protection contre le phishing"
npm run tag -- "Atelier libre"
```

## Tests

```sh
npm test
```

Résultat attendu : `Tests 13 passed (13)`.

| Fichier | Contenu |
|---|---|
| `tests/classify.test.ts` | Les 8 exemples du jeu `dev`, puis les cas limites : texte vide, formulation inconnue, ambiguïté, injection d'instructions, casse et accents |

Autres commandes :

```sh
# Relancer les tests à chaque modification
npm run test:watch
```

## Évaluation

Mesure les règles sur le jeu `evaluation` (t01 à t08) : prédictions, matrice de confusion et exactitude.

```sh
npm run evaluate
```

Résultat attendu : `Exactitude : 8/8`. La sortie est aussi enregistrée dans `preuves/evaluation.log`.

## Problèmes courants

| Symptôme | Solution |
|---|---|
| `tsx` ou `vitest` est introuvable | Lancer `npm install` dans `modules/i1-autotagging` |
| `npm run tag` sans texte affiche l'usage | Ajouter le titre après `--` : `npm run tag -- "Titre"` |
| Le texte est coupé ou mal lu dans PowerShell | Mettre le titre entre guillemets doubles |
| `npm run tag -- ""` affiche l'usage | PowerShell ne transmet pas la chaîne vide. Le cas du texte vide est couvert par `npm test` |
