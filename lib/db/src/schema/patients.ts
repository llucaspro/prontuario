import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { date, index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const patientsTable = pgTable(
  "pensare_patients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: text("professional_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date", { mode: "string" }),
    status: text("status").notNull().default("in_follow_up"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("pensare_patients_professional_name_idx").on(table.professionalId, table.fullName),
    pgPolicy("pensare_patients_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  professionalId: true,
  createdAt: true,
  archivedAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
