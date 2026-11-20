import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, integer, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const appointmentsTable = pgTable(
  "pensare_appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: text("professional_id").notNull(),
    patientId: uuid("patient_id").notNull().references(() => patientsTable.id, { onDelete: "restrict" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(50),
    appointmentType: text("appointment_type").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pensare_appointments_professional_date_idx").on(table.professionalId, table.scheduledAt),
    index("pensare_appointments_patient_idx").on(table.patientId),
    pgPolicy("pensare_appointments_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  id: true,
  professionalId: true,
  createdAt: true,
});

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
