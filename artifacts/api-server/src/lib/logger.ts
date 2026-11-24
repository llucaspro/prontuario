import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  code?: unknown;
  cause?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
  routine?: unknown;
};

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Resume um erro para log sem vazar dados de pacientes.
 *
 * Erros do Drizzle/pg trazem o SQL e os parâmetros da query (nome, e-mail,
 * telefone etc.) na mensagem. Para esses casos registramos só metadados
 * técnicos (código, constraint, tabela, coluna), nunca a mensagem.
 */
export function describeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { message: String(error) };
  const err = error as ErrorLike;
  const cause =
    err.cause && typeof err.cause === "object" ? (err.cause as ErrorLike) : undefined;
  const source = cause ?? err;

  const isDatabaseError =
    str(err.message)?.startsWith("Failed query:") === true ||
    str(source.code) !== undefined ||
    str(source.constraint) !== undefined;

  if (isDatabaseError) {
    return {
      type: str(err.name) ?? "DatabaseError",
      code: str(source.code),
      constraint: str(source.constraint),
      table: str(source.table),
      column: str(source.column),
      routine: str(source.routine),
    };
  }

  return { type: str(err.name), message: str(err.message), stack: str(err.stack) };
}
