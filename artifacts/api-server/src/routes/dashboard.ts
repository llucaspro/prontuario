import { and, asc, count, desc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  appointmentsTable,
  auditEventsTable,
  patientsTable,
} from "@workspace/db";
import { startOfAppDay, startOfAppMonth, startOfNextAppDay } from "../lib/app-date";
import { requireProfessional, withProfessionalScope } from "../lib/pensare-security";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;

  const now = new Date();
  const todayStart = startOfAppDay(now);
  const tomorrowStart = startOfNextAppDay(now);
  const monthStart = startOfAppMonth(now);

  const data = await withProfessionalScope(professionalId, async (tx) => {
    const [activePatientCount] = await tx
      .select({ value: count() })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.professionalId, professionalId),
          isNull(patientsTable.archivedAt),
          ne(patientsTable.status, "discharged"),
        ),
      );

    const [completedThisMonth] = await tx
      .select({ value: count() })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          eq(appointmentsTable.status, "completed"),
          gte(appointmentsTable.scheduledAt, monthStart),
          lt(appointmentsTable.scheduledAt, now),
        ),
      );

    const todayAppointments = await tx
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        patientName: patientsTable.fullName,
        scheduledAt: appointmentsTable.scheduledAt,
        appointmentType: appointmentsTable.appointmentType,
        status: appointmentsTable.status,
      })
      .from(appointmentsTable)
      .innerJoin(
        patientsTable,
        and(
          eq(appointmentsTable.patientId, patientsTable.id),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          gte(appointmentsTable.scheduledAt, todayStart),
          lt(appointmentsTable.scheduledAt, tomorrowStart),
        ),
      )
      .orderBy(asc(appointmentsTable.scheduledAt));

    const upcomingAppointments = await tx
      .select({
        id: appointmentsTable.id,
        patientId: appointmentsTable.patientId,
        patientName: patientsTable.fullName,
        scheduledAt: appointmentsTable.scheduledAt,
        appointmentType: appointmentsTable.appointmentType,
        status: appointmentsTable.status,
      })
      .from(appointmentsTable)
      .innerJoin(
        patientsTable,
        and(
          eq(appointmentsTable.patientId, patientsTable.id),
          eq(patientsTable.professionalId, professionalId),
        ),
      )
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          gte(appointmentsTable.scheduledAt, tomorrowStart),
          ne(appointmentsTable.status, "canceled"),
        ),
      )
      .orderBy(asc(appointmentsTable.scheduledAt))
      .limit(6);

    const recentActivity = await tx
      .select({
        id: auditEventsTable.id,
        category: auditEventsTable.entityType,
        occurredAt: auditEventsTable.occurredAt,
      })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.professionalId, professionalId))
      .orderBy(desc(auditEventsTable.occurredAt))
      .limit(8);

    return {
      activePatients: activePatientCount?.value ?? 0,
      sessionsThisMonth: completedThisMonth?.value ?? 0,
      appointmentsToday: todayAppointments.length,
      todayAppointments,
      upcomingAppointments,
      recentActivity: recentActivity.map((event) => ({
          ...event,
          label: "Atividade registrada",
          category: ["patient", "record", "appointment", "document", "profile"].includes(event.category)
            ? event.category
            : "administrative",
      })),
    };
  });

  res.json(GetDashboardResponse.parse(data));
});

export default router;
