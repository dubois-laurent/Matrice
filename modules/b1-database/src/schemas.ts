import { z } from "zod";
import {
  Domain,
  Mode,
  Period,
  SessionStatus,
  StudentGroup,
} from "../generated/prisma/enums.js";

// Messages d'erreur de zod en français
z.config(z.locales.fr());

const code = z.string().trim().min(1);

// "2026-10-19" (date réelle du calendrier) -> Date à minuit UTC
const isoDate = z.iso.date().transform((s) => new Date(`${s}T00:00:00Z`));

// Règles propres à une séance : elles ne dépendent que de ses propres valeurs.
// L'unicité du créneau d'un formateur, elle, est garantie par la base (@@unique).
export const sessionRulesSchema = z
  .object({
    mode: z.enum(Mode),
    status: z.enum(SessionStatus),
    hasTeacher: z.boolean(),
  })
  .refine((s) => s.mode !== "AUTO" || (!s.hasTeacher && s.status === "proposed"), {
    message: "Une séance en mode AUTO n'a pas de formateur et reste au statut proposed",
    path: ["mode"],
  })
  .refine((s) => s.status !== "confirmed" || s.hasTeacher, {
    message: "Une séance confirmée doit avoir un formateur assigné",
    path: ["status"],
  });

export const newSessionSchema = z.object({
  code,
  date: isoDate,
  period: z.enum(Period),
  studentGroup: z.enum(StudentGroup),
  mode: z.enum(Mode),
  title: z.string().trim().min(1, "Le titre ne peut pas être vide"),
  domain: z.enum(Domain),
  teacherCode: code.nullish(),
  status: z.enum(SessionStatus).default("proposed"),
});

export const listWeekSchema = z.object({
  week: isoDate,
  group: z.enum(StudentGroup).optional(),
});

export const confirmSchema = z.object({
  sessionCode: code,
  teacherCode: code.optional(),
});

export const hoursSchema = z.object({ week: isoDate.optional() });

export const validatedAcquisSchema = z.object({ sessionCode: code.optional() });

export const newAcquisSchema = z.object({
  sessionCode: code,
  label: z.string().trim().min(1, "Le libellé ne peut pas être vide"),
  validated: z.boolean().default(false),
});

// Valide une entrée avec un schéma zod et convertit l'échec en ValidationError
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")} : ${i.message}` : i.message))
      .join(" ; ");
    throw new Error(details);
  }
  return result.data;
}