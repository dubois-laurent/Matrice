import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { classify, type Category } from "./classify.js";

// Typage des lignes du corpus et des catégories pour éviter de le répéter partout
interface Row {
  id: string;
  jeu: string;
  texte: string;
  categorie: Category;
}

// On récupère le corpus complet puis on le filtre pour ne garder que le jeu "evaluation"
const corpus: Row[] = JSON.parse(readFileSync(new URL("../data/corpus.json", import.meta.url), "utf8"));
const evaluation = corpus.filter((row) => row.jeu === "evaluation");

const categories: Category[] = ["web", "data", "cyber", "a_revoir"];
const lines: string[] = [];

lines.push("Prédictions sur le jeu evaluation", "");
let correct = 0;

// Initialisation de la matrice de confusion
const matrix = categories.map(() => categories.map(() => 0));

for (const row of evaluation) {
  const { category, reason } = classify(row.texte);
  const ok = category === row.categorie;
  if (ok) {
    correct++;
  }
  matrix[categories.indexOf(row.categorie)][categories.indexOf(category)]++;
  const texte = row.texte === "" ? "(texte vide)" : row.texte;
  lines.push(`${row.id} | ${texte} | attendu : ${row.categorie} | prédit : ${category} | ${ok ? "OK" : "ERREUR"} | ${reason}`);
}

lines.push("", "Matrice de confusion (lignes = attendu, colonnes = prédit)", "");
lines.push(["", ...categories].map((c) => c.padEnd(9)).join(""));
categories.forEach((expected, i) => {
  lines.push([expected, ...matrix[i]].map((c) => String(c).padEnd(9)).join(""));
});

lines.push("", `Exactitude : ${correct}/${evaluation.length}`);

const output = lines.join("\n");
console.log(output);
writeFileSync(new URL("../preuves/evaluation.log", import.meta.url), output + "\n");