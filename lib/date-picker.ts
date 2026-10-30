export function dateToInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateToDisplayValue(date: Date, format = "dd.mm.yyyy") {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return format === "yyyy-mm-dd" ? `${yyyy}-${mm}-${dd}` : format === "mm/dd/yyyy" ? `${mm}/${dd}/${yyyy}` : `${dd}.${mm}.${yyyy}`;
}

export function parseDateValue(value?: string) {
  if (!value) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;

    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
  }

  const germanMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

  if (germanMatch) {
    const [, day, month, year] = germanMatch;

    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
  }

  const americanMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (americanMatch) {
    const [, month, day, year] = americanMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
  }

  return null;
}

export function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeDay(date: Date, minDate?: Date | null) {
  if (!minDate) {
    return false;
  }

  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const minimum = new Date(
    minDate.getFullYear(),
    minDate.getMonth(),
    minDate.getDate(),
  );

  return current < minimum;
}


/** Numerische Datumsausgabe; ausgeschriebene Monatsnamen bleiben sprachabhängig. */
export function preferredDateFormatter(format: string, locale: string, options: Intl.DateTimeFormatOptions = {}) {
  const fallback = new Intl.DateTimeFormat(locale, options);
  return { format(value: Date | number) {
    const date = typeof value === "number" ? new Date(value) : value;
    if (!options.day || !options.month || ["long", "short", "narrow"].includes(options.month)) return fallback.format(date);
    const parts = new Intl.DateTimeFormat("en-GB", { ...options, calendar: "gregory", numberingSystem: "latn" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const dd = part("day"), mm = part("month"), yyyy = options.year ? part("year") : "";
    const label = format === "yyyy-mm-dd" ? [yyyy, mm, dd].filter(Boolean).join("-") : format === "mm/dd/yyyy" ? [mm, dd, yyyy].filter(Boolean).join("/") : [dd, mm, yyyy].filter(Boolean).join(".");
    const weekday = options.weekday ? new Intl.DateTimeFormat(locale, { weekday: options.weekday, timeZone: options.timeZone }).format(date) + ", " : "";
    const time = options.hour ? " · " + new Intl.DateTimeFormat(locale, { hour: options.hour, minute: options.minute, timeZone: options.timeZone }).format(date) : "";
    return weekday + label + time;
  } };
}
