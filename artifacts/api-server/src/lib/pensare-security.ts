import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db, auditEventsTable, type RecordEntry } from "@workspace/db";

export type ClinicalPayload = {
  sessionType: string;
  goal: string | null;
  progress: string;
  professionalNotes: string | null;
  interventions: string | null;
  amendmentReason: string | null;
};

export type ScopedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function requireProfessional(req: Request, res: Response): string | null {
  const professionalId = getAuth(req).userId;
  if (!professionalId) {
    res.status(401).json({ error: "Autenticação necessária." });
    return null;
  }
  return professionalId;
}

export async function withProfessionalScope<T>(
  professionalId: string,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.professional_id', ${professionalId}, true)`,
    );
    return work(tx);
  });
}

export async function appendAuditEvent(
  tx: ScopedTransaction,
  professionalId: string,
  actorId: string,
  eventType: string,
  entityType: string,
  entityId: string | null,
  summary: string,
): Promise<void> {
  await tx.insert(auditEventsTable).values({
    professionalId,
    actorId,
    eventType,
    entityType,
    entityId,
    summary,
  });
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for clinical record encryption.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("pensare-record-encryption-v1", "utf8"),
      Buffer.from("aes-256-gcm", "utf8"),
      32,
    ),
  );
}

export function encryptClinicalPayload(payload: ClinicalPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptClinicalPayload(encrypted: string): ClinicalPayload {
  const [version, ivPart, tagPart, dataPart] = encrypted.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
    throw new Error("Unsupported or malformed clinical record ciphertext.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as ClinicalPayload;
}

export function toApiRecord(record: RecordEntry) {
  const payload = decryptClinicalPayload(record.encryptedPayload);
  return {
    id: record.id,
    patientId: record.patientId,
    appointmentId: record.appointmentId,
    occurredAt: record.occurredAt,
    recordKind: record.recordKind,
    ...payload,
    status: record.status,
    version: record.version,
    previousVersionId: record.previousVersionId,
    professionalId: record.professionalId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finalizedAt: record.finalizedAt,
  };
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
