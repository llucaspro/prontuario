import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { profilesTable } from "@workspace/db";
import {
  appendAuditEvent,
  requireProfessional,
  withProfessionalScope,
} from "../lib/pensare-security";

const router: IRouter = Router();
const defaultPreferences = { remindersEnabled: false, compactMode: false };

router.get("/profile", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const [profile] = await withProfessionalScope(professionalId, (tx) =>
    tx.select().from(profilesTable).where(eq(profilesTable.professionalId, professionalId)).limit(1),
  );
  res.json(
    GetProfileResponse.parse(
      profile
        ? {
            displayName: profile.displayName,
            professionalRegistration: profile.professionalRegistration,
            clinicName: profile.clinicName,
            preferences: profile.preferences,
          }
        : {
            displayName: "Profissional",
            professionalRegistration: null,
            clinicName: null,
            preferences: defaultPreferences,
          },
    ),
  );
});

router.patch("/profile", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const body = UpdateProfileBody.safeParse(req.body);
  if (!body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Dados do perfil inválidos." });
    return;
  }

  const profile = await withProfessionalScope(professionalId, async (tx) => {
    const [current] = await tx
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.professionalId, professionalId))
      .limit(1);
    const [updated] = await tx
      .insert(profilesTable)
      .values({
        professionalId,
        displayName: body.data.displayName?.trim() || current?.displayName || "Profissional",
        professionalRegistration:
          body.data.professionalRegistration === undefined
            ? current?.professionalRegistration ?? null
            : body.data.professionalRegistration,
        clinicName:
          body.data.clinicName === undefined
            ? current?.clinicName ?? null
            : body.data.clinicName,
        preferences: body.data.preferences ?? current?.preferences ?? defaultPreferences,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profilesTable.professionalId,
        set: {
          ...(body.data.displayName !== undefined && { displayName: body.data.displayName.trim() }),
          ...(body.data.professionalRegistration !== undefined && {
            professionalRegistration: body.data.professionalRegistration,
          }),
          ...(body.data.clinicName !== undefined && { clinicName: body.data.clinicName }),
          ...(body.data.preferences !== undefined && { preferences: body.data.preferences }),
          updatedAt: new Date(),
        },
      })
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "profile_updated",
      "profile",
      null,
      "Perfil profissional atualizado",
    );
    return updated;
  });

  res.json(
    UpdateProfileResponse.parse({
      displayName: profile.displayName,
      professionalRegistration: profile.professionalRegistration,
      clinicName: profile.clinicName,
      preferences: profile.preferences,
    }),
  );
});

export default router;
