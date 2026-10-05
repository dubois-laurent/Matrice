import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";

// Ces tests contournent volontairement zod et les opérations : ils envoient du SQL brut
// pour montrer ce que PostgreSQL refuse à lui seul (enums, clés étrangères, unicité, NOT NULL).
// Les séances de test ont un code qui commence par "d".

let weekId: number;
let teacherId: number;

type Row = Partial<{
  code: string;
  weekId: number | string;
  date: string;
  period: string;
  group: string;
  mode: string;
  title: string | null;
  domain: string;
  teacherId: number | null;
  status: string;
}>;

// INSERT brut : chaque valeur est typée explicitement, sans aucune validation côté code
function insertSession(row: Row = {}) {
  const r = {
    code: "d01",
    weekId,
    date: "2026-11-16",
    period: "am",
    group: "A",
    mode: "DG",
    title: "Séance SQL brute",
    domain: "web",
    teacherId: null,
    status: "proposed",
    ...row,
  };
  return prisma.$executeRaw`
    INSERT INTO sessions (code, week_id, date, period, student_group, mode, title, domain, teacher_id, status)
    VALUES (${r.code}, ${r.weekId}::int, ${r.date}::date, ${r.period}::period, ${r.group}::student_group,
            ${r.mode}::mode, ${r.title}, ${r.domain}::domain, ${r.teacherId}::int, ${r.status}::session_status)`;
}

async function cleanup() {
  await prisma.session.deleteMany({ where: { code: { startsWith: "d" } } });
  await prisma.week.deleteMany({ where: { sessions: { none: {} } } });
}

beforeAll(async () => {
  await cleanup();
  const week = await prisma.week.create({ data: { startDate: new Date("2026-11-16T00:00:00Z") } });
  weekId = week.id;
  teacherId = (await prisma.teacher.findUniqueOrThrow({ where: { code: "t1" } })).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("refus par PostgreSQL, sans passer par le code", () => {
  it("accepte une séance valide (témoin)", async () => {
    await expect(insertSession({ code: "d00" })).resolves.toBe(1);
  });

  it.each([
    ["période hors enum", { period: "soir" }, /invalid input value for enum/],
    ["groupe hors enum", { group: "C" }, /invalid input value for enum/],
    ["mode hors enum", { mode: "XX" }, /invalid input value for enum/],
    ["domaine hors enum", { domain: "autre" }, /invalid input value for enum/],
    ["statut hors enum", { status: "draft" }, /invalid input value for enum/],
    ["date impossible", { date: "2026-13-45" }, /out of range|invalid input syntax/],
    ["titre NULL", { title: null }, /null value in column "title"/],
    ["semaine inexistante (clé étrangère)", { weekId: 999999 }, /foreign key constraint/],
    ["formateur inexistant (clé étrangère)", { teacherId: 999999 }, /foreign key constraint/],
    ["code déjà utilisé", { code: "s01" }, /unique constraint/],
  ])("%s", async (_name, row: Row, message) => {
    await expect(insertSession({ code: "d01", ...row })).rejects.toThrow(message);
    expect(await prisma.session.count({ where: { code: "d01" } })).toBe(0);
  });

  it("formateur déjà pris sur ce créneau (contrainte unique)", async () => {
    await insertSession({ code: "d10", teacherId, date: "2026-11-17", period: "pm" });
    await expect(
      insertSession({ code: "d11", teacherId, date: "2026-11-17", period: "pm", group: "B" }),
    ).rejects.toThrow(/unique constraint/);
    expect(await prisma.session.count({ where: { code: "d11" } })).toBe(0);
  });

  it("supprimer un formateur utilisé est refusé (onDelete: Restrict)", async () => {
    await expect(prisma.teacher.delete({ where: { id: teacherId } })).rejects.toThrow();
    expect(await prisma.teacher.count({ where: { id: teacherId } })).toBe(1);
  });

  it("supprimer une séance supprime ses acquis (onDelete: Cascade)", async () => {
    await insertSession({ code: "d20", date: "2026-11-18" });
    const s = await prisma.session.findUniqueOrThrow({ where: { code: "d20" } });
    await prisma.acquis.create({ data: { sessionId: s.id, label: "Acquis jetable" } });
    await prisma.session.delete({ where: { code: "d20" } });
    expect(await prisma.acquis.count({ where: { sessionId: s.id } })).toBe(0);
  });
});