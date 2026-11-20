import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.get("host");

  if (!origin || !requestHost) {
    res.status(403).json({ error: "Origem da solicitação não verificada." });
    return;
  }

  try {
    if (new URL(origin).host !== requestHost) {
      res.status(403).json({ error: "Solicitação de outra origem bloqueada." });
      return;
    }
  } catch {
    res.status(403).json({ error: "Origem da solicitação inválida." });
    return;
  }

  next();
}
