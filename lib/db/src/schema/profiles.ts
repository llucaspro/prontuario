import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type ProfessionalPreferences = {
  remindersEnabled: boolean;
  compactMode: boolean;
};

export const profilesTable = pgTable(
  "pensare_profiles",
  {
    professionalId: text("professional_id").primaryKey(),
    displayName: text("display_name").notNull().default("Profissional"),
    professionalRegistration: text("professional_registration"),
    clinicName: text("clinic_name"),
    preferences: jsonb("preferences").$type<ProfessionalPreferences>().notNull().default({
      remindersEnabled: false,
      compactMode: false,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("pensare_profiles_professional_scope", {
      for: "all",
      to: "public",
      using: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
      withCheck: sql`${table.professionalId} = current_setting('app.professional_id', true)`,
    }),
  ],
).enableRLS();

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type ProfessionalProfileRecord = typeof profilesTable.$inferSelect;
