export function searchParamPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Einzelner Query-Wert als getrimmter String. Next liefert wiederholte
 * Parameter (`?search=a&search=b`) als Array — dann zählt der erste, damit ein
 * manipulierter Link nicht zu einem Typfehler führt.
 */
export function searchParamString(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? "";

  return trimmed || undefined;
}

export type Page<T> = {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

/** Schneidet eine bereits geladene Liste für die Anzeige in Seiten. */
export function paginate<T>(all: T[], page: number, pageSize: number): Page<T> {
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    items: all.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total,
    pageSize,
  };
}
