import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const documentsTable = pgTable(
  "pensare_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: text("professional_id").notNull(),
    patientId: uuid("patient_id").references(() => patientsTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    documentType: text("document_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    index("pensare_documents_professional_created_idx").on(table.professionalId, table.createdAt),
    pgPolicy("pensare_documents_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  professionalId: true,
  createdAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
