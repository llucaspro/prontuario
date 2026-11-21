import { and, count, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetReportsQueryParams, GetReportsResponse } from "@workspace/api-zod";
import { appointmentsTable, patientsTable } from "@workspace/db";
import { APP_TIME_ZONE, dateAtStartOfDay } from "../lib/app-date";
import { requireProfessional, withProfessionalScope } from "../lib/pensare-security";

const router: IRouter = Router();
const appointmentStatuses = ["scheduled", "confirmed", "completed", "canceled", "no_show"] as const;

router.get("/reports", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const query = GetReportsQueryParams.safeParse({
    year: typeof req.query.year === "string" ? req.query.year : undefined,
  });
  if (!query.success) {
    res.status(400).json({ error: "Ano do relatório inválido." });
    return;
  }
  const year = query.data.year ?? new Date().getFullYear();
  const yearStart = dateAtStartOfDay(year, 1, 1);
  const nextYearStart = dateAtStartOfDay(year + 1, 1, 1);

  const report = await withProfessionalScope(professionalId, async (tx) => {
    const [activePatients] = await tx
      .select({ value: count() })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.professionalId, professionalId),
          isNull(patientsTable.archivedAt),
          ne(patientsTable.status, "discharged"),
        ),
      );
    const [archivedPatients] = await tx
      .select({ value: count() })
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.professionalId, professionalId),
          isNotNull(patientsTable.archivedAt),
        ),
      );

    const [sessions] = await tx
      .select({ value: count() })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          eq(appointmentsTable.status, "completed"),
          gte(appointmentsTable.scheduledAt, yearStart),
          lt(appointmentsTable.scheduledAt, nextYearStart),
        ),
      );

    const groupedStatuses = await tx
      .select({
        status: appointmentsTable.status,
        value: count(),
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          gte(appointmentsTable.scheduledAt, yearStart),
          lt(appointmentsTable.scheduledAt, nextYearStart),
        ),
      )
      .groupBy(appointmentsTable.status);
    const byStatus = new Map(groupedStatuses.map((item) => [item.status, item.value]));

    // O fuso vai como literal (constante confiável) e não como parâmetro: com parâmetro,
    // o SELECT usa $1 e o GROUP BY usa $2, e o Postgres rejeita a query (erro 42803).
    const monthExpr = sql<number>`extract(month from timezone(${sql.raw(`'${APP_TIME_ZONE}'`)}, ${appointmentsTable.scheduledAt}))`;
    const groupedMonths = await tx
      .select({
        month: monthExpr,
        value: count(),
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.professionalId, professionalId),
          eq(appointmentsTable.status, "completed"),
          gte(appointmentsTable.scheduledAt, yearStart),
          lt(appointmentsTable.scheduledAt, nextYearStart),
        ),
      )
      .groupBy(monthExpr);
    const byMonth = new Map(groupedMonths.map((item) => [Number(item.month), item.value]));

    return {
      activePatients: activePatients?.value ?? 0,
      archivedPatients: archivedPatients?.value ?? 0,
      sessionsThisYear: sessions?.value ?? 0,
      appointmentsByStatus: appointmentStatuses.map((status) => ({
        status,
        count: byStatus.get(status) ?? 0,
      })),
      monthlySessions: Array.from({ length: 12 }, (_, index) => ({
        month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
          .format(new Date(Date.UTC(year, index, 1)))
          .replace(/\.$/, ""),
        count: byMonth.get(index + 1) ?? 0,
      })),
    };
  });

  res.json(GetReportsResponse.parse(report));
});

export default router;
