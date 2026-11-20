import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, integer, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";
import { patientsTable } from "./patients";

export const recordsTable = pgTable(
  "pensare_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: text("professional_id").notNull(),
    patientId: uuid("patient_id").notNull().references(() => patientsTable.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointmentsTable.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordKind: text("record_kind").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [
    index("pensare_records_professional_patient_date_idx").on(table.professionalId, table.patientId, table.occurredAt),
    index("pensare_records_previous_version_idx").on(table.previousVersionId),
    pgPolicy("pensare_records_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertRecordSchema = createInsertSchema(recordsTable).omit({
  id: true,
  professionalId: true,
  createdAt: true,
  updatedAt: true,
  finalizedAt: true,
});

export type InsertRecord = z.infer<typeof insertRecordSchema>;
export type RecordEntry = typeof recordsTable.$inferSelect;
