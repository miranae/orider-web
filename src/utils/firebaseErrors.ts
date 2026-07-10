export function isPermissionDeniedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? (err as { code?: unknown }).code : undefined;
  if (code === "permission-denied" || code === "functions/permission-denied") return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Missing or insufficient permissions");
}
