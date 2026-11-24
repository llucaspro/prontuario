import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AmendRecordBody,
  AmendRecordParams,
  AmendRecordResponse,
  CreateRecordBody,
  CreateRecordParams,
  CreateRecordResponse,
  FinalizeRecordParams,
  FinalizeRecordResponse,
  ListPatientRecordsParams,
  ListPatientRecordsResponse,
  ListRecordVersionsParams,
  ListRecordVersionsResponse,
  UpdateRecordBody,
  UpdateRecordParams,
  UpdateRecordResponse,
} from "@workspace/api-zod";
import { appointmentsTable, patientsTable, recordsTable } from "@workspace/db";
import {
  appendAuditEvent,
  decryptClinicalPayload,
  encryptClinicalPayload,
  requireProfessional,
  toApiRecord,
  withProfessionalScope,
  type ClinicalPayload,
} from "../lib/pensare-security";

const router: IRouter = Router();

function payloadFrom(
  value: {
    sessionType?: string;
    goal?: string | null;
    progress?: string;
    professionalNotes?: string | null;
    interventions?: string | null;
  },
  current?: ClinicalPayload,
  amendmentReason: string | null = current?.amendmentReason ?? null,
): ClinicalPayload {
  return {
    sessionType: value.sessionType ?? current?.sessionType ?? "",
    goal: value.goal === undefined ? (current?.goal ?? null) : value.goal,
    progress: value.progress ?? current?.progress ?? "",
    professionalNotes:
      value.professionalNotes === undefined
        ? (current?.professionalNotes ?? null)
        : value.professionalNotes,
    interventions:
      value.interventions === undefined
        ? (current?.interventions ?? null)
        : value.interventions,
    amendmentReason,
  };
}

router.get("/patients/:patientId/records", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = ListPatientRecordsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de paciente inválido." });
    return;
  }

  const records = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.professionalId, professionalId),
          eq(recordsTable.patientId, params.data.patientId),
        ),
      )
      .orderBy(asc(recordsTable.occurredAt), asc(recordsTable.version)),
  );
  res.json(ListPatientRecordsResponse.parse(records.map(toApiRecord)));
});

router.post("/patients/:patientId/records", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = CreateRecordParams.safeParse(req.params);
  const body = CreateRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados do registro inválidos." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    const [patient] = await tx
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.id, params.data.patientId),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    if (!patient) return { kind: "patient_missing" as const };

    if (body.data.appointmentId) {
      const [appointment] = await tx
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.id, body.data.appointmentId),
            eq(appointmentsTable.patientId, patient.id),
            eq(appointmentsTable.professionalId, professionalId),
          ),
        )
        .limit(1);
      if (!appointment) return { kind: "appointment_mismatch" as const };
    }

    const payload = payloadFrom(body.data);
    const [record] = await tx
      .insert(recordsTable)
      .values({
        professionalId,
        patientId: patient.id,
        appointmentId: body.data.appointmentId ?? null,
        occurredAt: body.data.occurredAt,
        recordKind: body.data.recordKind,
        encryptedPayload: encryptClinicalPayload(payload),
      })
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "record_created",
      "record",
      record.id,
      "Rascunho de prontuário criado",
    );
    return { kind: "created" as const, record };
  });

  if (result.kind === "patient_missing") {
    res.status(404).json({ error: "Paciente não encontrado." });
    return;
  }
  if (result.kind === "appointment_mismatch") {
    res.status(400).json({ error: "Atendimento não pertence a este paciente." });
    return;
  }
  res.status(201).json(CreateRecordResponse.parse(toApiRecord(result.record)));
});

router.patch("/records/:recordId", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = UpdateRecordParams.safeParse(req.params);
  const body = UpdateRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de atualização inválidos." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    const [current] = await tx
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    if (!current) return { kind: "missing" as const };
    if (current.status !== "draft") return { kind: "finalized" as const };

    const currentPayload = decryptClinicalPayload(current.encryptedPayload);
    const payload = payloadFrom(body.data, currentPayload);
    const [updated] = await tx
      .update(recordsTable)
      .set({
        ...(body.data.occurredAt !== undefined && { occurredAt: body.data.occurredAt }),
        ...(body.data.recordKind !== undefined && { recordKind: body.data.recordKind }),
        encryptedPayload: encryptClinicalPayload(payload),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
          eq(recordsTable.status, "draft"),
        ),
      )
      .returning();
    if (!updated) return { kind: "finalized" as const };
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "record_draft_updated",
      "record",
      updated.id,
      "Rascunho de prontuário atualizado",
    );
    return { kind: "updated" as const, record: updated };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Registro não encontrado." });
    return;
  }
  if (result.kind === "finalized") {
    res.status(409).json({ error: "Registros finalizados não podem ser alterados." });
    return;
  }
  res.json(UpdateRecordResponse.parse(toApiRecord(result.record)));
});

router.post("/records/:recordId/finalize", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = FinalizeRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de registro inválido." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    const [updated] = await tx
      .update(recordsTable)
      .set({ status: "finalized", finalizedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
          eq(recordsTable.status, "draft"),
        ),
      )
      .returning();
    if (updated) {
      await appendAuditEvent(
        tx,
        professionalId,
        professionalId,
        "record_finalized",
        "record",
        updated.id,
        "Prontuário finalizado e bloqueado para edição",
      );
      return { kind: "finalized" as const, record: updated };
    }

    const [exists] = await tx
      .select({ id: recordsTable.id, status: recordsTable.status })
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    return exists
      ? { kind: "already_finalized" as const }
      : { kind: "missing" as const };
  });
  if (result.kind === "missing") {
    res.status(404).json({ error: "Registro não encontrado." });
    return;
  }
  if (result.kind === "already_finalized") {
    res.status(409).json({ error: "Este registro já foi finalizado." });
    return;
  }
  res.json(FinalizeRecordResponse.parse(toApiRecord(result.record)));
});

router.post("/records/:recordId/amendments", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = AmendRecordParams.safeParse(req.params);
  const body = AmendRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Justificativa e dados da retificação são obrigatórios." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    const [previous] = await tx
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    if (!previous) return { kind: "missing" as const };
    if (previous.status !== "finalized") return { kind: "not_finalized" as const };

    const oldPayload = decryptClinicalPayload(previous.encryptedPayload);
    const payload = payloadFrom(
      body.data,
      oldPayload,
      body.data.justification.trim(),
    );
    const [amendment] = await tx
      .insert(recordsTable)
      .values({
        professionalId,
        patientId: previous.patientId,
        appointmentId: previous.appointmentId,
        occurredAt: body.data.occurredAt,
        recordKind: previous.recordKind,
        encryptedPayload: encryptClinicalPayload(payload),
        status: "finalized",
        version: previous.version + 1,
        previousVersionId: previous.id,
        finalizedAt: new Date(),
      })
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "record_amended",
      "record",
      amendment.id,
      "Nova versão de prontuário criada com justificativa",
    );
    return { kind: "amended" as const, record: amendment };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Registro não encontrado." });
    return;
  }
  if (result.kind === "not_finalized") {
    res.status(409).json({ error: "Finalize o rascunho antes de criar uma retificação." });
    return;
  }
  res.status(201).json(AmendRecordResponse.parse(toApiRecord(result.record)));
});

router.get("/records/:recordId/versions", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = ListRecordVersionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identificador de registro inválido." });
    return;
  }

  const versions = await withProfessionalScope(professionalId, async (tx) => {
    const [selected] = await tx
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.id, params.data.recordId),
          eq(recordsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    if (!selected) return null;

    const patientRecords = await tx
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.patientId, selected.patientId),
          eq(recordsTable.professionalId, professionalId),
        ),
      )
      .orderBy(asc(recordsTable.version), asc(recordsTable.createdAt));

    const relatedIds = new Set<string>([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of patientRecords) {
        if (
          (relatedIds.has(item.id) || (item.previousVersionId && relatedIds.has(item.previousVersionId))) &&
          !relatedIds.has(item.id)
        ) {
          relatedIds.add(item.id);
          changed = true;
        }
        if (item.previousVersionId && relatedIds.has(item.id) && !relatedIds.has(item.previousVersionId)) {
          relatedIds.add(item.previousVersionId);
          changed = true;
        }
      }
    }
    return patientRecords.filter((item) => relatedIds.has(item.id));
  });
  if (!versions) {
    res.status(404).json({ error: "Registro não encontrado." });
    return;
  }
  res.json(ListRecordVersionsResponse.parse(versions.map(toApiRecord)));
});

export default router;
