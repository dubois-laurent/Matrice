import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import {
  confirmSchema,
  hoursSchema,
  listWeekSchema,
  newAcquisSchema,
  newSessionSchema,
  parse,
  sessionRulesSchema,
  validatedAcquisSchema,
} from "./schemas.js";

export const HOURS_PER_HALF_DAY = 4;

// Lundi (minuit UTC) de la semaine qui contient la date
function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}
// Chaque opération reçoit une entrée non fiable (unknown) et la valide avec zod avant d'écrire en base.

// Traduit les erreurs PostgreSQL remontées par Prisma en erreurs métier
function translateDbError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = JSON.stringify(error.meta ?? {});
    if (target.includes("teacher_id")) {
      return new Error(
        "Ce formateur est déjà affecté à une séance sur ce créneau (même date et même période)",
      );
    }
    return new Error("Une séance avec ce code existe déjà");
  }
  return error;
}

async function findTeacherByCode(db: PrismaClient, code: string) {
  const teacher = await db.teacher.findUnique({ where: { code } });
  if (!teacher) throw new Error(`Formateur introuvable : ${code}`);
  return teacher;
}

// 1. Créer une séance
export async function createSession(raw: unknown, db: PrismaClient = prisma) {
  const input = parse(newSessionSchema, raw);
  parse(sessionRulesSchema, {
    mode: input.mode,
    status: input.status,
    hasTeacher: Boolean(input.teacherCode),
  });

  const teacher = input.teacherCode
    ? await findTeacherByCode(db, input.teacherCode)
    : null;

  // La semaine est déduite de la date : la séance ne peut pas être rattachée à la mauvaise semaine
  const startDate = mondayOf(input.date);
  await db.week.createMany({ data: [{ startDate }], skipDuplicates: true });
  const week = await db.week.findUniqueOrThrow({ where: { startDate } });

  try {
    return await db.session.create({
      data: {
        code: input.code,
        weekId: week.id,
        date: input.date,
        period: input.period,
        studentGroup: input.studentGroup,
        mode: input.mode,
        title: input.title,
        domain: input.domain,
        teacherId: teacher?.id ?? null,
        status: input.status,
      },
      include: { teacher: true },
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

// 2. Lister la semaine avec les formateurs.
// Groupe A -> A + Promotion ; groupe B -> B + Promotion ; sans groupe -> tout.
export async function listWeek(raw: unknown, db: PrismaClient = prisma) {
  const { week, group } = parse(listWeekSchema, raw);
  return db.session.findMany({
    where: {
      week: { startDate: mondayOf(week) },
      ...(group && { studentGroup: { in: [group, "Promotion"] } }),
    },
    include: { teacher: true },
    orderBy: [{ date: "asc" }, { period: "asc" }, { code: "asc" }],
  });
}

// 3. Confirmer une affectation : affecte un formateur (optionnel s'il est déjà assigné) et passe en confirmed.
// Si deux appels visent le même formateur sur le même créneau, la contrainte unique en refuse un.
export async function confirmAssignment(raw: unknown, db: PrismaClient = prisma) {
  const { sessionCode, teacherCode } = parse(confirmSchema, raw);

  return db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { code: sessionCode },
    });
    if (!session) throw new Error(`Séance introuvable : ${sessionCode}`);

    const teacherId = teacherCode
      ? (await findTeacherByCode(tx as PrismaClient, teacherCode)).id
      : session.teacherId;

    parse(sessionRulesSchema, {
      mode: session.mode,
      status: "confirmed",
      hasTeacher: teacherId !== null,
    });

    try {
      return await tx.session.update({
        where: { id: session.id },
        data: { teacherId, status: "confirmed" },
        include: { teacher: true },
      });
    } catch (error) {
      throw translateDbError(error);
    }
  });
}

// 4. Heures par formateur : séances confirmées x 4 h par demi-journée
export async function hoursByTeacher(raw: unknown = {}, db: PrismaClient = prisma) {
  const { week } = parse(hoursSchema, raw);
  const weekFilter = week ? { week: { startDate: mondayOf(week) } } : {};

  const [teachers, counts] = await Promise.all([
    db.teacher.findMany({ orderBy: { code: "asc" } }),
    db.session.groupBy({
      by: ["teacherId"],
      where: { status: "confirmed", teacherId: { not: null }, ...weekFilter },
      _count: { _all: true },
    }),
  ]);

  return teachers.map((teacher) => {
    const sessions =
      counts.find((c) => c.teacherId === teacher.id)?._count._all ?? 0;
    return {
      teacher: teacher.code,
      name: teacher.name,
      sessions,
      hours: sessions * HOURS_PER_HALF_DAY,
    };
  });
}

// 5. Retrouver les acquis validés (de toutes les séances ou d'une seule)
export async function validatedAcquis(raw: unknown = {}, db: PrismaClient = prisma) {
  const { sessionCode } = parse(validatedAcquisSchema, raw);
  return db.acquis.findMany({
    where: {
      validated: true,
      ...(sessionCode && { session: { code: sessionCode } }),
    },
    include: { session: { select: { code: true, title: true } } },
    orderBy: [{ sessionId: "asc" }, { id: "asc" }],
  });
}

// Ajouter un acquis : validatedAt est déduit de validated, les deux restent cohérents
export async function addAcquis(raw: unknown, db: PrismaClient = prisma) {
  const { sessionCode, label, validated } = parse(newAcquisSchema, raw);
  const session = await db.session.findUnique({ where: { code: sessionCode } });
  if (!session) throw new Error(`Séance introuvable : ${sessionCode}`);
  return db.acquis.create({
    data: {
      sessionId: session.id,
      label,
      validated,
      validatedAt: validated ? new Date() : null,
    },
  });
}