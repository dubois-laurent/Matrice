import { classify } from "./classify";

const text = process.argv.slice(2).join(" ");

if (process.argv.length < 3) {
  console.error('Usage : npm run tag -- "Titre de la séance"');
  process.exit(1);
}

const { category, reason } = classify(text);
console.log(JSON.stringify({ texte: text, categorie: category, motif: reason }, null, 2));