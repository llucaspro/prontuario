import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const auditEventsTable = pgTable(
  "pensare_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: text("professional_id").notNull(),
    actorId: text("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pensare_audit_professional_date_idx").on(table.professionalId, table.occurredAt),
    pgPolicy("pensare_audit_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({
  id: true,
  occurredAt: true,
});

export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
