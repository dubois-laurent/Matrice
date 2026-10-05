import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { createClient, prisma } from "../src/db.js";
import { confirmAssignment, createSession } from "../src/operations.js";

// Preuve de concurrence : chaque "client" est un PrismaClient distinct, donc une connexion
// PostgreSQL distincte. Toutes les requêtes d'un même test sont lancées en même temps.
// Les séances de test ont un code qui commence par "c" (les séances du seed commencent par "s").

const base = { studentGroup: "A", mode: "DG", title: "Séance concurrente", domain: "web" };
const clients: PrismaClient[] = [];

async function openClients(n: number) {
  const created = Array.from({ length: n }, () => createClient());
  await Promise.all(created.map((c) => c.$connect()));
  clients.push(...created);
  return created;
}

async function cleanup() {
  await prisma.session.deleteMany({ where: { code: { startsWith: "c" } } });
  await prisma.week.deleteMany({ where: { sessions: { none: {} } } });
}

const summary = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r, i) =>
    r.status === "fulfilled"
      ? `client ${i} : accepté`
      : `client ${i} : refusé (${r.reason.code ?? r.reason.message})`,
  );

beforeAll(async () => {
  if ((await prisma.teacher.count()) === 0) throw new Error("Base vide : lance d'abord `npx prisma db seed`");
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await Promise.all(clients.map((c) => c.$disconnect()));
  await prisma.$disconnect();
});

describe("un formateur ne peut pas avoir 2 séances au même créneau, même en concurrence", () => {
  it("deux transactions voient toutes les deux le créneau libre : la base n'en accepte qu'une", async () => {
    const date = "2026-10-26";
    await createSession({ ...base, code: "c01", date, period: "am" });
    await createSession({ ...base, code: "c02", date, period: "am", studentGroup: "B" });
    const t1 = await prisma.teacher.findUniqueOrThrow({ where: { code: "t1" } });
    const [dbA, dbB] = await openClients(2);

    // Barrière : chaque transaction lit "le formateur est-il libre ?" puis attend l'autre avant d'écrire.
    // Un contrôle fait uniquement dans le code répondrait donc "libre" aux deux.
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const seen: number[] = [];

    const attempt = (db: PrismaClient, code: string) =>
      db.$transaction(async (tx) => {
        const taken = await tx.session.count({
          where: { teacherId: t1.id, date: new Date(`${date}T00:00:00Z`), period: "am" },
        });
        seen.push(taken);
        if (++arrived === 2) release();
        await barrier;
        return tx.session.update({
          where: { code },
          data: { teacherId: t1.id, status: "confirmed" },
        });
      });

    const results = await Promise.allSettled([attempt(dbA, "c01"), attempt(dbB, "c02")]);
    console.log(`Créneau vu libre par ${seen.filter((n) => n === 0).length} transaction(s) sur 2\n  ${summary(results).join("\n  ")}`);

    expect(seen).toEqual([0, 0]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(rejected.reason.code).toBe("P2002");

    const holders = await prisma.session.count({
      where: { teacherId: t1.id, date: new Date(`${date}T00:00:00Z`), period: "am" },
    });
    expect(holders).toBe(1);
  });

  it("8 confirmations simultanées du même formateur sur le même créneau : une seule réussit", async () => {
    const db = await openClients(8);
    const slots = [
      ["2026-10-26", "pm"],
      ["2026-10-27", "am"],
      ["2026-10-27", "pm"],
      ["2026-10-28", "am"],
      ["2026-10-28", "pm"],
    ] as const;

    for (const [round, [date, period]] of slots.entries()) {
      const codes = Array.from({ length: db.length }, (_, i) => `c1${round}${i}`);
      for (const code of codes) await createSession({ ...base, code, date, period });

      const results = await Promise.allSettled(
        codes.map((code, i) => confirmAssignment({ sessionCode: code, teacherCode: "t2" }, db[i])),
      );
      if (round === 0) console.log(summary(results).join("\n  "));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") expect(r.reason.message).toMatch(/déjà affecté/);
      }

      // Les 7 transactions refusées ont été annulées : ces séances n'ont ni formateur ni statut confirmé
      const sessions = await prisma.session.findMany({ where: { code: { in: codes } } });
      expect(sessions.filter((s) => s.teacherId !== null)).toHaveLength(1);
      expect(sessions.filter((s) => s.status === "confirmed")).toHaveLength(1);
    }
  });

  it("6 créations simultanées pour le même formateur et le même créneau : une seule réussit", async () => {
    const db = await openClients(6);
    const results = await Promise.allSettled(
      db.map((client, i) =>
        createSession({ ...base, code: `c2${i}`, date: "2026-10-29", period: "am", teacherCode: "t3" }, client),
      ),
    );
    console.log(summary(results).join("\n  "));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason.message).toMatch(/déjà affecté/);
    }
    expect(await prisma.session.count({ where: { code: { startsWith: "c2" } } })).toBe(1);
  });

  it("5 créations simultanées avec le même code : une seule réussit", async () => {
    const db = await openClients(5);
    const results = await Promise.allSettled(
      db.map((client) => createSession({ ...base, code: "c30", date: "2026-10-30", period: "pm" }, client)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason.message).toMatch(/existe déjà/);
    }
  });
});

describe("la contrainte ne bloque que les vrais conflits", () => {
  it("3 formateurs différents sur le même créneau, en même temps : tous acceptés", async () => {
    const db = await openClients(3);
    const results = await Promise.allSettled(
      ["t1", "t2", "t3"].map((teacherCode, i) =>
        createSession({ ...base, code: `c4${i}`, date: "2026-11-03", period: "am", teacherCode }, db[i]),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("le même formateur sur 5 créneaux différents, en même temps : tous acceptés", async () => {
    const db = await openClients(5);
    const slots = [
      ["2026-11-04", "am"], ["2026-11-04", "pm"], ["2026-11-05", "am"],
      ["2026-11-05", "pm"], ["2026-11-06", "am"],
    ] as const;
    const results = await Promise.allSettled(
      slots.map(([date, period], i) =>
        createSession({ ...base, code: `c5${i}`, date, period, teacherCode: "t1" }, db[i]),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("plusieurs séances AUTO sans formateur sur le même créneau : toutes acceptées", async () => {
    const db = await openClients(5);
    const results = await Promise.allSettled(
      db.map((client, i) =>
        createSession({ ...base, code: `c6${i}`, date: "2026-11-09", period: "am", mode: "AUTO" }, client),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});