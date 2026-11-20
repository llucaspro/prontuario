import { and, asc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ArchivePatientParams,
  ArchivePatientResponse,
  CreatePatientBody,
  CreatePatientResponse,
  GetPatientParams,
  GetPatientResponse,
  ListPatientsQueryParams,
  ListPatientsResponse,
  UpdatePatientBody,
  UpdatePatientParams,
  UpdatePatientResponse,
} from "@workspace/api-zod";
import { patientsTable } from "@workspace/db";
import {
  appendAuditEvent,
  dateOnly,
  requireProfessional,
  withProfessionalScope,
} from "../lib/pensare-security";

const router: IRouter = Router();

router.get("/patients", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;

  const query = ListPatientsQueryParams.safeParse({
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    includeArchived: req.query.includeArchived === "true",
  });
  if (!query.success) {
    res.status(400).json({ error: "Filtros de pacientes inválidos." });
    return;
  }

  const conditions: SQL[] = [eq(patientsTable.professionalId, professionalId)];
  if (!query.data.includeArchived) conditions.push(isNull(patientsTable.archivedAt));
  if (query.data.status) conditions.push(eq(patientsTable.status, query.data.status));
  if (query.data.search?.trim()) {
    conditions.push(ilike(patientsTable.fullName, `%${query.data.search.trim()}%`));
  }

  const patients = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select()
      .from(patientsTable)
      .where(and(...conditions))
      .orderBy(asc(patientsTable.fullName)),
  );
  res.json(
    ListPatientsResponse.parse(
      patients.map((patient) => ({
        ...patient,
        birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
        startDate: new Date(`${patient.startDate}T00:00:00Z`),
      })),
    ),
  );
});

router.post("/patients", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const body = CreatePatientBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Dados do paciente inválidos." });
    return;
  }

  const patient = await withProfessionalScope(professionalId, async (tx) => {
    const [created] = await tx
      .insert(patientsTable)
      .values({
        professionalId,
        fullName: body.data.fullName.trim(),
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        birthDate: body.data.birthDate ? dateOnly(body.data.birthDate) : null,
        status: body.data.status,
        startDate: dateOnly(body.data.startDate),
      })
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "patient_created",
      "patient",
      created.id,
      "Paciente cadastrado",
    );
    return created;
  });

  res.status(201).json(
    CreatePatientResponse.parse({
      ...patient,
      birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
      startDate: new Date(`${patient.startDate}T00:00:00Z`),
    }),
  );
});

router.get("/patients/:patientId", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de paciente inválido." });
    return;
  }

  const [patient] = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select()
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.id, params.data.patientId),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .limit(1),
  );
  if (!patient) {
    res.status(404).json({ error: "Paciente não encontrado." });
    return;
  }
  res.json(
    GetPatientResponse.parse({
      ...patient,
      birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
      startDate: new Date(`${patient.startDate}T00:00:00Z`),
    }),
  );
});

router.patch("/patients/:patientId", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = UpdatePatientParams.safeParse(req.params);
  const body = UpdatePatientBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de atualização inválidos." });
    return;
  }

  const values = {
    ...(body.data.fullName !== undefined && { fullName: body.data.fullName.trim() }),
    ...(body.data.email !== undefined && { email: body.data.email }),
    ...(body.data.phone !== undefined && { phone: body.data.phone }),
    ...(body.data.birthDate !== undefined && {
      birthDate: body.data.birthDate ? dateOnly(body.data.birthDate) : null,
    }),
    ...(body.data.status !== undefined && { status: body.data.status }),
    ...(body.data.startDate !== undefined && { startDate: dateOnly(body.data.startDate) }),
  };

  const patient = await withProfessionalScope(professionalId, async (tx) => {
    const [updated] = await tx
      .update(patientsTable)
      .set(values)
      .where(
        and(
          eq(patientsTable.id, params.data.patientId),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .returning();
    if (updated) {
      await appendAuditEvent(
        tx,
        professionalId,
        professionalId,
        "patient_updated",
        "patient",
        updated.id,
        "Cadastro administrativo atualizado",
      );
    }
    return updated;
  });
  if (!patient) {
    res.status(404).json({ error: "Paciente não encontrado." });
    return;
  }

  res.json(
    UpdatePatientResponse.parse({
      ...patient,
      birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
      startDate: new Date(`${patient.startDate}T00:00:00Z`),
    }),
  );
});

router.post("/patients/:patientId/archive", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = ArchivePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de paciente inválido." });
    return;
  }

  const patient = await withProfessionalScope(professionalId, async (tx) => {
    const [archived] = await tx
      .update(patientsTable)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(patientsTable.id, params.data.patientId),
          eq(patientsTable.professionalId, professionalId),
          isNull(patientsTable.archivedAt),
        ),
      )
      .returning();
    if (archived) {
      await appendAuditEvent(
        tx,
        professionalId,
        professionalId,
        "patient_archived",
        "patient",
        archived.id,
        "Paciente arquivado sem exclusão de documentos",
      );
    }
    return archived;
  });
  if (!patient) {
    res.status(404).json({ error: "Paciente não encontrado ou já arquivado." });
    return;
  }

  res.json(
    ArchivePatientResponse.parse({
      ...patient,
      birthDate: patient.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : null,
      startDate: new Date(`${patient.startDate}T00:00:00Z`),
    }),
  );
});

export default router;
