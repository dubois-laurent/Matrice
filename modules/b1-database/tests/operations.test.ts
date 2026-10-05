import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import {
  addAcquis,
  confirmAssignment,
  createSession,
  hoursByTeacher,
  listWeek,
  validatedAcquis,
} from "../src/operations.js";

// Ces tests s'exécutent sur la base du conteneur Docker, après `npx prisma db seed`.
// Les séances de test ont un code qui commence par "x" et sont supprimées à la fin.

const WEEK = "2026-10-19";

const base = {
  period: "am",
  studentGroup: "A",
  mode: "DG",
  title: "Séance de test",
  domain: "web",
};

const hoursOf = (rows: { teacher: string; hours: number }[], teacher: string) =>
  rows.find((r) => r.teacher === teacher)?.hours;

async function cleanup() {
  await prisma.session.deleteMany({ where: { code: { startsWith: "x" } } });
  await prisma.week.deleteMany({ where: { sessions: { none: {} } } });
}

beforeAll(async () => {
  const seeded = await prisma.session.count({ where: { code: "s01" } });
  if (seeded === 0) throw new Error("Base vide : lance d'abord `npx prisma db seed`");
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("créer une séance", () => {
  it("crée une séance proposée avec son formateur", async () => {
    const s = await createSession({ ...base, code: "x01", date: "2026-10-21", teacherCode: "t1" });
    expect(s.status).toBe("proposed");
    expect(s.teacher?.code).toBe("t1");
  });

  it("accepte une séance AUTO sans formateur", async () => {
    const s = await createSession({ ...base, code: "x02", date: "2026-10-21", period: "pm", mode: "AUTO" });
    expect(s.teacherId).toBeNull();
  });

  it("rattache la séance au lundi de sa semaine", async () => {
    const s = await createSession({ ...base, code: "x03", date: "2026-10-23", studentGroup: "B" });
    const week = await prisma.week.findUniqueOrThrow({ where: { id: s.weekId } });
    expect(week.startDate.toISOString().slice(0, 10)).toBe(WEEK);
  });
});

describe("lister la semaine avec les formateurs", () => {
  it("retourne les séances du seed avec leur formateur", async () => {
    const sessions = await listWeek({ week: WEEK });
    const s01 = sessions.find((s) => s.code === "s01");
    expect(s01?.teacher?.name).toBe("Camille Exemple");
    expect(sessions.find((s) => s.code === "s06")?.teacher).toBeNull();
  });

  it("donne la même semaine quel que soit le jour demandé", async () => {
    const monday = await listWeek({ week: "2026-10-19" });
    const friday = await listWeek({ week: "2026-10-23" });
    expect(friday.map((s) => s.code)).toEqual(monday.map((s) => s.code));
  });

  it("groupe A : séances A + Promotion", async () => {
    const codes = (await listWeek({ week: WEEK, group: "A" })).map((s) => s.code);
    expect(codes).toEqual(expect.arrayContaining(["s01", "s03", "s04", "s06"]));
    expect(codes).not.toContain("s02");
    expect(codes).not.toContain("s05");
  });

  it("groupe B : séances B + Promotion", async () => {
    const codes = (await listWeek({ week: WEEK, group: "B" })).map((s) => s.code);
    expect(codes).toEqual(expect.arrayContaining(["s02", "s03", "s05", "s06"]));
    expect(codes).not.toContain("s01");
    expect(codes).not.toContain("s04");
  });

  it("trie par date puis par période", async () => {
    const sessions = await listWeek({ week: WEEK });
    const keys = sessions.map((s) => `${s.date.toISOString()}${s.period}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("confirmer une affectation", () => {
  it("confirme une séance dont le formateur est déjà assigné", async () => {
    await createSession({ ...base, code: "x04", date: "2026-10-22", teacherCode: "t1" });
    const confirmed = await confirmAssignment({ sessionCode: "x04" });
    expect(confirmed.status).toBe("confirmed");
  });

  it("affecte un formateur au moment de confirmer", async () => {
    await createSession({ ...base, code: "x05", date: "2026-10-22", period: "pm" });
    const confirmed = await confirmAssignment({ sessionCode: "x05", teacherCode: "t2" });
    expect(confirmed.teacher?.code).toBe("t2");
    expect(confirmed.status).toBe("confirmed");
  });

  it("refuse de confirmer sans formateur", async () => {
    await createSession({ ...base, code: "x06", date: "2026-10-23", period: "pm" });
    await expect(confirmAssignment({ sessionCode: "x06" })).rejects.toThrow(/formateur/);
    const s = await prisma.session.findUniqueOrThrow({ where: { code: "x06" } });
    expect(s.status).toBe("proposed");
  });

  it("refuse de confirmer une séance AUTO", async () => {
    await expect(
      confirmAssignment({ sessionCode: "x02", teacherCode: "t3" }),
    ).rejects.toThrow(/AUTO/);
  });

  it("refuse une séance ou un formateur inconnu", async () => {
    await expect(confirmAssignment({ sessionCode: "s99" })).rejects.toThrow(/introuvable/);
    await expect(
      confirmAssignment({ sessionCode: "x06", teacherCode: "t9" }),
    ).rejects.toThrow(/introuvable/);
  });
});

describe("un formateur ne peut pas avoir 2 séances sur le même créneau", () => {
  it("refuse la création d'une 2e séance au même créneau", async () => {
    await createSession({ ...base, code: "x07", date: "2026-10-23", teacherCode: "t3" });
    await expect(
      createSession({ ...base, code: "x08", date: "2026-10-23", studentGroup: "B", teacherCode: "t3" }),
    ).rejects.toThrow(/déjà affecté/);
    expect(await prisma.session.count({ where: { code: "x08" } })).toBe(0);
  });

  it("refuse la confirmation qui créerait un conflit", async () => {
    await createSession({ ...base, code: "x09", date: "2026-10-23", studentGroup: "B" });
    await expect(
      confirmAssignment({ sessionCode: "x09", teacherCode: "t3" }),
    ).rejects.toThrow(/déjà affecté/);
    const s = await prisma.session.findUniqueOrThrow({ where: { code: "x09" } });
    expect(s.status).toBe("proposed");
    expect(s.teacherId).toBeNull();
  });

  it("autorise le même formateur sur une autre période", async () => {
    const s = await createSession({ ...base, code: "x10", date: "2026-10-23", period: "pm", teacherCode: "t3" });
    expect(s.teacher?.code).toBe("t3");
  });
});

describe("heures par formateur", () => {
  it("compte 4 h par séance confirmée", async () => {
    const before = hoursOf(await hoursByTeacher({ week: WEEK }), "t2");
    await createSession({ ...base, code: "x11", date: "2026-10-21", studentGroup: "B", teacherCode: "t2" });
    expect(hoursOf(await hoursByTeacher({ week: WEEK }), "t2")).toBe(before);
    await confirmAssignment({ sessionCode: "x11" });
    expect(hoursOf(await hoursByTeacher({ week: WEEK }), "t2")).toBe(before! + 4);
  });

  it("ne compte pas les séances proposées", async () => {
    const rows = await hoursByTeacher({ week: WEEK });
    const t3 = rows.find((r) => r.teacher === "t3")!;
    expect(t3.hours).toBe(t3.sessions * 4);
    expect(await prisma.session.count({ where: { teacher: { code: "t3" }, status: "confirmed" } })).toBe(t3.sessions);
  });

  it("retourne 0 h pour une semaine sans séance", async () => {
    const rows = await hoursByTeacher({ week: "2026-11-02" });
    expect(rows.map((r) => r.hours)).toEqual([0, 0, 0]);
  });
});

describe("acquis validés", () => {
  it("ne retourne que les acquis validés, avec leur date", async () => {
    await createSession({ ...base, code: "x12", date: "2026-10-21", studentGroup: "B" });
    await addAcquis({ sessionCode: "x12", label: "Acquis validé", validated: true });
    await addAcquis({ sessionCode: "x12", label: "Acquis non validé" });

    const rows = await validatedAcquis({ sessionCode: "x12" });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Acquis validé");
    expect(rows[0].validatedAt).not.toBeNull();
  });

  it("sans filtre, retourne les acquis validés de toutes les séances", async () => {
    const rows = await validatedAcquis();
    expect(rows.every((a) => a.validated)).toBe(true);
    expect(rows.map((a) => a.session.code)).toEqual(expect.arrayContaining(["s01", "s02", "s03"]));
  });

  it("un acquis non validé n'a pas de date de validation", async () => {
    const a = await prisma.acquis.findFirstOrThrow({ where: { label: "Acquis non validé" } });
    expect(a.validated).toBe(false);
    expect(a.validatedAt).toBeNull();
  });
});

describe("entrées invalides refusées", () => {
  const ok = { ...base, code: "x99", date: "2026-10-21" };

  it.each([
    ["période inconnue", { ...ok, period: "soir" }, /period/],
    ["groupe inconnu", { ...ok, studentGroup: "C" }, /studentGroup/],
    ["mode inconnu", { ...ok, mode: "XX" }, /mode/],
    ["domaine inconnu", { ...ok, domain: "autre" }, /domain/],
    ["date impossible", { ...ok, date: "2026-13-45" }, /date/],
    ["date au mauvais format", { ...ok, date: "21/10/2026" }, /date/],
    ["titre vide", { ...ok, title: "   " }, /titre/],
    ["code vide", { ...ok, code: "" }, /code/],
    ["champs manquants", { code: "x99" }, /date/],
    ["entrée qui n'est pas un objet", "n'importe quoi", /Entrée invalide/],
    ["AUTO avec formateur", { ...ok, mode: "AUTO", teacherCode: "t3" }, /AUTO/],
    ["AUTO déjà confirmée", { ...ok, mode: "AUTO", status: "confirmed" }, /AUTO/],
    ["confirmée sans formateur", { ...ok, status: "confirmed" }, /confirmée/],
    ["formateur inconnu", { ...ok, teacherCode: "t9" }, /introuvable/],
    ["code déjà utilisé", { ...ok, code: "s01" }, /existe déjà/],
  ])("%s", async (_name, input, message) => {
    await expect(createSession(input)).rejects.toThrow(message);
    expect(await prisma.session.count({ where: { code: "x99" } })).toBe(0);
  });

  it("refuse un acquis au libellé vide ou sur une séance inconnue", async () => {
    await expect(addAcquis({ sessionCode: "s01", label: " " })).rejects.toThrow(/libellé/);
    await expect(addAcquis({ sessionCode: "s99", label: "x" })).rejects.toThrow(/introuvable/);
  });

  it("refuse une semaine invalide", async () => {
    await expect(listWeek({ week: "abc" })).rejects.toThrow(/week/);
    await expect(listWeek({ week: WEEK, group: "Z" })).rejects.toThrow(/group/);
  });
});