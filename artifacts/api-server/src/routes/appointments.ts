import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAppointmentBody,
  CreateAppointmentResponse,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentResponse,
} from "@workspace/api-zod";
import { appointmentsTable, patientsTable } from "@workspace/db";
import {
  appendAuditEvent,
  requireProfessional,
  type ScopedTransaction,
  withProfessionalScope,
} from "../lib/pensare-security";

const router: IRouter = Router();

async function hasScheduleConflict(
  tx: ScopedTransaction,
  professionalId: string,
  scheduledAt: Date,
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const end = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const conditions = [
    eq(appointmentsTable.professionalId, professionalId),
    inArray(appointmentsTable.status, ["scheduled", "confirmed"]),
    lt(appointmentsTable.scheduledAt, end),
    sql`${appointmentsTable.scheduledAt} + (${appointmentsTable.durationMinutes} * interval '1 minute') > ${scheduledAt}`,
  ];
  if (excludeAppointmentId) {
    conditions.push(ne(appointmentsTable.id, excludeAppointmentId));
  }
  const [overlap] = await tx
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(and(...conditions))
    .limit(1);
  return Boolean(overlap);
}

async function lockProfessionalSchedule(
  tx: ScopedTransaction,
  professionalId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${professionalId}, 0))`,
  );
}

router.get("/appointments", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const query = ListAppointmentsQueryParams.safeParse({
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
  });
  if (!query.success || (query.data.from && query.data.to && query.data.from >= query.data.to)) {
    res.status(400).json({ error: "Período de atendimentos inválido." });
    return;
  }

  const conditions = [eq(appointmentsTable.professionalId, professionalId)];
  if (query.data.from) conditions.push(gte(appointmentsTable.scheduledAt, query.data.from));
  if (query.data.to) conditions.push(lt(appointmentsTable.scheduledAt, query.data.to));
  if (query.data.status) conditions.push(eq(appointmentsTable.status, query.data.status));

  const appointments = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        patientName: patientsTable.fullName,
        scheduledAt: appointmentsTable.scheduledAt,
        durationMinutes: appointmentsTable.durationMinutes,
        appointmentType: appointmentsTable.appointmentType,
        status: appointmentsTable.status,
        createdAt: appointmentsTable.createdAt,
      })
      .from(appointmentsTable)
      .innerJoin(
        patientsTable,
        and(
          eq(appointmentsTable.patientId, patientsTable.id),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(appointmentsTable.scheduledAt)),
  );
  res.json(ListAppointmentsResponse.parse(appointments));
});

router.post("/appointments", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const body = CreateAppointmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Dados do atendimento inválidos." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    await lockProfessionalSchedule(tx, professionalId);
    const [patient] = await tx
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.id, body.data.patientId),
          eq(patientsTable.professionalId, professionalId),
          isNull(patientsTable.archivedAt),
        ),
      )
      .limit(1);
    if (!patient) return { kind: "patient_missing" as const };
    if (
      await hasScheduleConflict(
        tx,
        professionalId,
        body.data.scheduledAt,
        body.data.durationMinutes,
      )
    ) {
      return { kind: "conflict" as const };
    }

    const [created] = await tx
      .insert(appointmentsTable)
      .values({
        professionalId,
        patientId: patient.id,
        scheduledAt: body.data.scheduledAt,
        durationMinutes: body.data.durationMinutes,
        appointmentType: body.data.appointmentType.trim(),
      })
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "appointment_created",
      "appointment",
      created.id,
      "Atendimento agendado",
    );
    const [appointment] = await tx
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        patientName: patientsTable.fullName,
        scheduledAt: appointmentsTable.scheduledAt,
        durationMinutes: appointmentsTable.durationMinutes,
        appointmentType: appointmentsTable.appointmentType,
        status: appointmentsTable.status,
        createdAt: appointmentsTable.createdAt,
      })
      .from(appointmentsTable)
      .innerJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .where(eq(appointmentsTable.id, created.id))
      .limit(1);
    return { kind: "created" as const, appointment };
  });

  if (result.kind === "patient_missing") {
    res.status(404).json({ error: "Paciente não encontrado ou arquivado." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Este horário já está ocupado." });
    return;
  }
  res.status(201).json(CreateAppointmentResponse.parse(result.appointment));
});

router.patch("/appointments/:appointmentId", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const params = UpdateAppointmentParams.safeParse(req.params);
  const body = UpdateAppointmentBody.safeParse(req.body);
  if (!params.success || !body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Dados de atualização inválidos." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    await lockProfessionalSchedule(tx, professionalId);
    const [current] = await tx
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, params.data.appointmentId),
          eq(appointmentsTable.professionalId, professionalId),
        ),
      )
      .limit(1);
    if (!current) return { kind: "missing" as const };

    const scheduledAt = body.data.scheduledAt ?? current.scheduledAt;
    const durationMinutes = body.data.durationMinutes ?? current.durationMinutes;
    const nextStatus = body.data.status ?? current.status;
    const scheduleNeedsCheck =
      body.data.scheduledAt !== undefined ||
      body.data.durationMinutes !== undefined ||
      (body.data.status !== undefined && ["scheduled", "confirmed"].includes(nextStatus));
    if (
      ["scheduled", "confirmed"].includes(nextStatus) &&
      scheduleNeedsCheck &&
      (await hasScheduleConflict(
        tx,
        professionalId,
        scheduledAt,
        durationMinutes,
        current.id,
      ))
    ) {
      return { kind: "conflict" as const };
    }

    const [updated] = await tx
      .update(appointmentsTable)
      .set({
        ...(body.data.scheduledAt !== undefined && { scheduledAt: body.data.scheduledAt }),
        ...(body.data.durationMinutes !== undefined && { durationMinutes: body.data.durationMinutes }),
        ...(body.data.appointmentType !== undefined && { appointmentType: body.data.appointmentType.trim() }),
        ...(body.data.status !== undefined && { status: body.data.status }),
      })
      .where(
        and(
          eq(appointmentsTable.id, current.id),
          eq(appointmentsTable.professionalId, professionalId),
        ),
      )
      .returning();
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "appointment_updated",
      "appointment",
      updated.id,
      "Atendimento atualizado",
    );
    const [appointment] = await tx
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        patientName: patientsTable.fullName,
        scheduledAt: appointmentsTable.scheduledAt,
        durationMinutes: appointmentsTable.durationMinutes,
        appointmentType: appointmentsTable.appointmentType,
        status: appointmentsTable.status,
        createdAt: appointmentsTable.createdAt,
      })
      .from(appointmentsTable)
      .innerJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .where(eq(appointmentsTable.id, updated.id))
      .limit(1);
    return { kind: "updated" as const, appointment };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Atendimento não encontrado." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Este horário já está ocupado." });
    return;
  }
  res.json(UpdateAppointmentResponse.parse(result.appointment));
});

export default router;
