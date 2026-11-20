import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { Router, type IRouter } from "express";
import {
  ExportDocumentBody,
  ListDocumentsResponse,
} from "@workspace/api-zod";
import {
  appointmentsTable,
  documentsTable,
  patientsTable,
  profilesTable,
  recordsTable,
} from "@workspace/db";
import { startOfAppDate, startOfNextAppDate } from "../lib/app-date";
import {
  appendAuditEvent,
  requireProfessional,
  toApiRecord,
  withProfessionalScope,
} from "../lib/pensare-security";

const router: IRouter = Router();
const PDF_RECORD_LIMIT = 500;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function documentTitle(
  documentType: string,
  patientName?: string,
): string {
  const titles: Record<string, string> = {
    attendance_declaration: "Declaração de comparecimento",
    administrative_history: "Histórico administrativo",
    authorized_patient_record: "Prontuário psicológico autorizado",
  };
  return `${titles[documentType] || "Documento"}${patientName ? ` · ${patientName}` : ""}`;
}

function buildPdf(
  title: string,
  profile: { displayName: string; professionalRegistration: string | null; clinicName: string | null },
  content: (pdf: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 54, left: 56, right: 56 } });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    pdf.font("Helvetica-Bold").fontSize(18).text("Pensare", { align: "left" });
    pdf.moveDown(0.35);
    pdf.font("Helvetica-Bold").fontSize(14).text(title);
    pdf.moveDown(0.6);
    pdf.font("Helvetica").fontSize(10);
    pdf.text(profile.displayName);
    if (profile.professionalRegistration) pdf.text(profile.professionalRegistration);
    if (profile.clinicName) pdf.text(profile.clinicName);
    pdf.text(`Gerado em ${formatDate(new Date())}`);
    pdf.moveDown();
    pdf.moveTo(56, pdf.y).lineTo(539, pdf.y).strokeColor("#d7ded7").stroke();
    pdf.moveDown();
    content(pdf);
    pdf.moveDown();
    pdf.font("Helvetica-Oblique").fontSize(8).fillColor("#69736b")
      .text("Documento confidencial. Compartilhe somente com autorização e finalidade apropriadas.", {
        align: "center",
      });
    pdf.end();
  });
}

router.get("/documents", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const documents = await withProfessionalScope(professionalId, (tx) =>
    tx
      .select({
        id: documentsTable.id,
        patientId: documentsTable.patientId,
        title: documentsTable.title,
        documentType: documentsTable.documentType,
        createdAt: documentsTable.createdAt,
        createdBy: documentsTable.createdBy,
      })
      .from(documentsTable)
      .where(eq(documentsTable.professionalId, professionalId))
      .orderBy(desc(documentsTable.createdAt))
      .limit(100),
  );
  res.json(ListDocumentsResponse.parse(documents));
});

router.post("/documents/export", async (req, res): Promise<void> => {
  const professionalId = requireProfessional(req, res);
  if (!professionalId) return;
  const body = ExportDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Dados da exportação inválidos." });
    return;
  }
  const input = body.data;
  if (input.from && input.to && input.from > input.to) {
    res.status(400).json({ error: "O período informado é inválido." });
    return;
  }
  if (
    ["attendance_declaration", "authorized_patient_record"].includes(input.documentType) &&
    !input.patientId
  ) {
    res.status(400).json({ error: "Selecione um paciente para este documento." });
    return;
  }
  if (
    input.documentType === "attendance_declaration" &&
    (!input.from || !input.to)
  ) {
    res.status(400).json({ error: "Informe o período da declaração." });
    return;
  }

  const result = await withProfessionalScope(professionalId, async (tx) => {
    const [profileRow] = await tx
      .select({
        displayName: profilesTable.displayName,
        professionalRegistration: profilesTable.professionalRegistration,
        clinicName: profilesTable.clinicName,
      })
      .from(profilesTable)
      .where(eq(profilesTable.professionalId, professionalId))
      .limit(1);
    const profile = profileRow ?? {
      displayName: "Profissional",
      professionalRegistration: null,
      clinicName: null,
    };

    let patient: { id: string; fullName: string } | undefined;
    if (input.patientId) {
      [patient] = await tx
        .select({ id: patientsTable.id, fullName: patientsTable.fullName })
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.id, input.patientId),
            eq(patientsTable.professionalId, professionalId),
          ),
        )
        .limit(1);
      if (!patient) return { kind: "patient_missing" as const };
    }

    let content: (pdf: PDFKit.PDFDocument) => void;
    if (input.documentType === "attendance_declaration") {
      const conditions = [
        eq(appointmentsTable.professionalId, professionalId),
        eq(appointmentsTable.patientId, patient!.id),
        eq(appointmentsTable.status, "completed"),
        gte(appointmentsTable.scheduledAt, startOfAppDate(input.from!)),
        lt(appointmentsTable.scheduledAt, startOfNextAppDate(input.to!)),
      ];
      const visits = await tx
        .select({
          scheduledAt: appointmentsTable.scheduledAt,
          durationMinutes: appointmentsTable.durationMinutes,
          appointmentType: appointmentsTable.appointmentType,
        })
        .from(appointmentsTable)
        .where(and(...conditions))
        .orderBy(asc(appointmentsTable.scheduledAt))
        .limit(PDF_RECORD_LIMIT + 1);
      if (visits.length > PDF_RECORD_LIMIT) return { kind: "too_many" as const };
      if (!visits.length) return { kind: "no_visits" as const };
      content = (pdf) => {
        pdf.font("Helvetica").fontSize(11).fillColor("#303832")
          .text(`Declaramos, para os fins cabíveis, que ${patient!.fullName} compareceu a atendimento profissional no período solicitado.`);
        pdf.moveDown();
        pdf.font("Helvetica-Bold").text("Atendimentos realizados");
        pdf.moveDown(0.4);
        for (const visit of visits) {
          pdf.font("Helvetica").text(
            `${formatDate(visit.scheduledAt)} · ${visit.durationMinutes} minutos · ${visit.appointmentType}`,
          );
        }
      };
    } else if (input.documentType === "authorized_patient_record") {
      const conditions = [
        eq(recordsTable.professionalId, professionalId),
        eq(recordsTable.patientId, patient!.id),
        eq(recordsTable.recordKind, "psychological_record"),
        eq(recordsTable.status, "finalized"),
      ];
      if (input.from) conditions.push(gte(recordsTable.occurredAt, startOfAppDate(input.from)));
      if (input.to) conditions.push(lt(recordsTable.occurredAt, startOfNextAppDate(input.to)));
      const encryptedRecords = await tx
        .select()
        .from(recordsTable)
        .where(and(...conditions))
        .orderBy(asc(recordsTable.occurredAt), asc(recordsTable.version))
        .limit(PDF_RECORD_LIMIT + 1);
      if (encryptedRecords.length > PDF_RECORD_LIMIT) return { kind: "too_many" as const };
      const records = encryptedRecords.map(toApiRecord);
      content = (pdf) => {
        pdf.font("Helvetica-Bold").fontSize(11).fillColor("#303832")
          .text(`Paciente: ${patient!.fullName}`);
        pdf.moveDown();
        if (!records.length) {
          pdf.font("Helvetica").fontSize(10).text("Nenhum registro finalizado foi encontrado no período solicitado.");
          return;
        }
        for (const record of records) {
          pdf.font("Helvetica-Bold").fontSize(11)
            .text(`${formatDate(record.occurredAt)} · ${record.sessionType}`);
          pdf.moveDown(0.3);
          for (const [label, value] of [
            ["Objetivo", record.goal],
            ["Evolução", record.progress],
            ["Notas profissionais", record.professionalNotes],
            ["Intervenções", record.interventions],
          ] as const) {
            if (value) {
              pdf.font("Helvetica-Bold").fontSize(9).text(label);
              pdf.font("Helvetica").fontSize(10).text(value);
              pdf.moveDown(0.25);
            }
          }
          pdf.font("Helvetica").fontSize(8).fillColor("#69736b")
            .text(`Versão ${record.version} · ${record.status === "finalized" ? "Finalizado" : "Rascunho"}`);
          pdf.moveDown();
        }
      };
    } else {
      const conditions = [eq(appointmentsTable.professionalId, professionalId)];
      if (patient) conditions.push(eq(appointmentsTable.patientId, patient.id));
      if (input.from) conditions.push(gte(appointmentsTable.scheduledAt, startOfAppDate(input.from)));
      if (input.to) conditions.push(lt(appointmentsTable.scheduledAt, startOfNextAppDate(input.to)));
      const history = await tx
        .select({
          patientName: patientsTable.fullName,
          scheduledAt: appointmentsTable.scheduledAt,
          durationMinutes: appointmentsTable.durationMinutes,
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
        .where(and(...conditions))
        .orderBy(asc(appointmentsTable.scheduledAt))
        .limit(PDF_RECORD_LIMIT + 1);
      if (history.length > PDF_RECORD_LIMIT) return { kind: "too_many" as const };
      content = (pdf) => {
        if (!history.length) {
          pdf.font("Helvetica").fontSize(10).text("Nenhum atendimento encontrado no período solicitado.");
          return;
        }
        for (const entry of history) {
          pdf.font("Helvetica-Bold").fontSize(10)
            .text(`${formatDate(entry.scheduledAt)} · ${entry.patientName}`);
          pdf.font("Helvetica").fontSize(9)
            .text(`${entry.appointmentType} · ${entry.durationMinutes} min · ${entry.status}`);
          pdf.moveDown(0.4);
        }
      };
    }

    const title = documentTitle(input.documentType, patient?.fullName);
    const pdfBuffer = await buildPdf(title, profile, content);
    const [document] = await tx
      .insert(documentsTable)
      .values({
        professionalId,
        patientId: patient?.id ?? null,
        title,
        documentType: input.documentType,
        createdBy: professionalId,
      })
      .returning({ id: documentsTable.id });
    await appendAuditEvent(
      tx,
      professionalId,
      professionalId,
      "document_exported",
      "document",
      document.id,
      "Documento autorizado exportado",
    );
    return { kind: "generated" as const, pdfBuffer };
  });

  if (result.kind === "patient_missing") {
    res.status(404).json({ error: "Paciente não encontrado." });
    return;
  }
  if (result.kind === "too_many") {
    res.status(413).json({ error: "Reduza o período para exportar até 500 registros por arquivo." });
    return;
  }
  if (result.kind === "no_visits") {
    res.status(404).json({ error: "Nenhum atendimento concluído encontrado no período." });
    return;
  }

  res
    .status(200)
    .type("application/pdf")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="pensare-${input.documentType}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    )
    .setHeader("Cache-Control", "no-store")
    .send(result.pdfBuffer);
});

export default router;
