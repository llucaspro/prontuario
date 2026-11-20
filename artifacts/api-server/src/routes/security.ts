import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
} from "@workspace/api-zod";
import { auditEventsTable } from "@workspace/db";
import { requireProfessional, withProfessionalScope } from "../lib/pensare-security";

const router: IRouter = Router();

router.get("/security/audit", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const query = ListAuditEventsQueryParams.safeParse({
    limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
  });
  if (!query.success) {
    res.status(400).json({ error: "Limite de eventos inválido." });
    return;
  }

  const events = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select({
        id: auditEventsTable.id,
        actorId: auditEventsTable.actorId,
        eventType: auditEventsTable.eventType,
        entityType: auditEventsTable.entityType,
        entityId: auditEventsTable.entityId,
        occurredAt: auditEventsTable.occurredAt,
        summary: auditEventsTable.summary,
      })
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.professionalId, professionalId)))
      .orderBy(desc(auditEventsTable.occurredAt))
      .limit(query.data.limit),
  );
  res.json(ListAuditEventsResponse.parse(events));
});

export default router;
