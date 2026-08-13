/** Prisma-Fehlercode für die Verletzung eines Unique-Constraints. */
export function isUniqueConstraintError(error: unknown, target: string) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, meta } = error as { code?: string; meta?: { target?: unknown } };

  return code === "P2002" && JSON.stringify(meta?.target ?? "").includes(target);
}
