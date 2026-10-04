import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// PrismaPg est un adaptateur pour PostgreSQL utilisé avec Prisma
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

// Voici le jeu de données pour les enseignants, les sessions et les acquis, implémenté en constantes
const teachers = [
    { code: "T1", name: "Camille Exemple" },
    { code: "T2", name: "Alex Démonstration" },
    { code: "T3", name: "Sam Fictif" },
];

const sessions = [
    { code: "s01", date: "2026-10-19", period: "am", studentGroup: "A", mode: "DG", title: "React composants", domain: "web", teacher: "t1", status: "confirmed" },
    { code: "s02", date: "2026-10-19", period: "am", studentGroup: "B", mode: "DG", title: "React événements", domain: "web", teacher: "t2", status: "confirmed" },
    { code: "s03", date: "2026-10-19", period: "pm", studentGroup: "Promotion", mode: "CE", title: "Données et SQL", domain: "data", teacher: "t1", status: "confirmed" },
    { code: "s04", date: "2026-10-20", period: "am", studentGroup: "A", mode: "DG", title: "Authentification", domain: "cyber", teacher: "t2", status: "proposed" },
    { code: "s05", date: "2026-10-20", period: "am", studentGroup: "B", mode: "DG", title: "Revue de projet", domain: "projet", teacher: "t3", status: "proposed" },
    { code: "s06", date: "2026-10-20", period: "pm", studentGroup: "Promotion", mode: "AUTO", title: "Travail autonome", domain: "projet", teacher: null, status: "proposed" },
] as const;

// Le jeu de données original n'avait pas d'infos sur les acquis validés par les étudiants du coup j'en ai validé certains fictivement
const acquis = [
    { session: "s01", label: "Créer un composant React", validated: true },
    { session: "s01", label: "Passer des props", validated: true },
    { session: "s02", label: "Gérer un événement onClick", validated: true },
    { session: "s03", label: "Écrire une jointure SQL", validated: false },
    { session: "s03", label: "Filtrer avec WHERE", validated: true },
] as const;

// Fonction principale pour insérer les données dans la base de données
async function main() {

    // Pour l'insertion des formateurs et des sessions, j'utilise Map afin de garder une correspondance entre les codes et les IDs générés par la base de données
    const teachersIds = new Map<string, number>();
    for (const teacher of teachers) {
        // J'utilise upsert pour insérer ou mettre à jour les enseignants en fonction de leur code sinon j'aurai pu utiliser createMany mais cela ne gérerait pas les mises à jour.
        const createdTeacher = await prisma.teacher.upsert({
            where: { code: teacher.code },
            update: { name: teacher.name },
            create: teacher
        });
        teachersIds.set(teacher.code, createdTeacher.id);
    }

    const week = await prisma.week.upsert({
        where: { startDate: new Date("2026-10-19") },
        update: {},
        create: { startDate: new Date("2026-10-19") },
    });

    const sessionsIds = new Map<string, number>();
    for (const session of sessions) {
        const data = {
            weekId: week.id,
            date: new Date(session.date),
            period: session.period,
            studentGroup: session.studentGroup,
            mode: session.mode,
            title: session.title,
            domain: session.domain,
            teacherId: session.teacher ? teachersIds.get(session.teacher)! : null,
            status: session.status,
        };
        const createdSession = await prisma.session.upsert({
            where: { code: session.code },
            update: data,
            create: { ...data, code: session.code },
        });
        sessionsIds.set(session.code, createdSession.id);
    }

    await prisma.acquis.createMany({
        data: acquis.map((a) => ({
            sessionId: sessionsIds.get(a.session)!,
            label: a.label,
            validated: a.validated,
            validatedAt: a.validated ? new Date("2026-10-19") : null,
        })),
    });

    console.log(
        `Test seed : ${teachers.length} formateurs, ${sessions.length} sessions, ${acquis.length} acquis`
    );

}

// Appel de la fonction principale pour exécuter le seed
main()
    .then(() => {
        console.log("Seed OK.");
    })
    .catch((error) => {
        console.error("Erreur, c'est vraiment dommage:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
