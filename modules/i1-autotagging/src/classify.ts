export type Category = "web" | "data" | "cyber" | "a_revoir";
type Domain = "web" | "data" | "cyber";

// Racines de mots-clés tirées du jeu "dev" uniquement.
// Un mot du texte correspond s'il commence par la racine : "composants" correspond à "composant".
const KEYWORDS: Record<Domain, string[]> = {
    web: ["react", "composant", "propriet", "css", "style", "responsive"],
    data: ["sql", "jointure", "requet", "csv", "nettoyage", "donnee"],
    cyber: ["authentif", "droit", "phishing"],
};

// Minuscules, sans accents, découpé en mots : "Détecter le phishing !" -> ["detecter", "le", "phishing"]
function words(text: string): string[] {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

export function classify(text: string): { category: Category; reason: string } {
    const w = words(text);

    // Donc la on a 3 conditions if :
    // 1. texte vide
    if (w.length === 0) return { category: "a_revoir", reason: "texte vide" };

    const found = (Object.keys(KEYWORDS) as Domain[])
        .map((domain) => ({
            domain,
            stems: KEYWORDS[domain].filter((stem) => w.some((word) => word.startsWith(stem))),
        }))
        .filter((f) => f.stems.length > 0);


    // 2. aucun mot-clé connu
    if (found.length === 0) {
        return { category: "a_revoir", reason: "aucun mot-clé connu" };
    }
    // 3. ambigu (plusieurs domaines trouvés)
    if (found.length > 1) {
        const detail = found.map((f) => `${f.domain} (${f.stems.join(", ")})`).join(" et ");
        return { category: "a_revoir", reason: `ambigu : ${detail}` };
    }
    return { category: found[0].domain, reason: `mots-clés ${found[0].stems.join(", ")}` };
}