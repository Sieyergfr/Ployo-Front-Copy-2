const weekdayIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Prüft, ob der wöchentliche Digest jetzt fällig ist. Läuft der externe
 * Scheduler täglich einmal (wie /api/cron/cleanup), reicht ein 2h-Toleranz-
 * fenster um den konfigurierten Zeitpunkt aus `digestTime` (z. B.
 * "monday-0800") zu treffen.
 */
export function isDigestDue(digestTime: string, now: Date) {
  if (digestTime === "disabled") return false;

  const [weekday, hhmm] = digestTime.split("-");
  const targetDay = weekdayIndex[weekday];

  if (targetDay === undefined || !hhmm || hhmm.length !== 4) return false;
  if (now.getDay() !== targetDay) return false;

  const targetHour = Number.parseInt(hhmm.slice(0, 2), 10);

  return Math.abs(now.getHours() - targetHour) <= 1;
}
