/**
 * Übersetzbare Benachrichtigungstexte (E-Mail, Push, In-App).
 *
 * Bewusst NICHT über next-intl/`messages/*.json`: die laufen über
 * `getRequestConfig` und liefern die Locale des *aktuellen Requests* — beim
 * Versand ist das aber die Locale des Auslösenden (z. B. HR, die einen Urlaub
 * genehmigt), nicht die des Empfängers. Hier entscheidet stattdessen
 * `UserPreference.language` des jeweiligen Empfängers, aufgelöst in
 * `dispatchNotification`. Dadurch gilt die in der App (oder im Web)
 * eingestellte Sprache geräteübergreifend auch für Benachrichtigungen.
 *
 * Aufrufer liefern deshalb keinen fertigen Text mehr, sondern einen
 * `NotificationMessage` (Schlüssel + Parameter) — gerendert wird pro Empfänger.
 */

export const notificationLocales = ["de", "en"] as const;

export type NotificationLocale = (typeof notificationLocales)[number];

export const defaultNotificationLocale: NotificationLocale = "de";

export function toNotificationLocale(value: string | null | undefined): NotificationLocale {
  return (notificationLocales as readonly string[]).includes(value ?? "")
    ? (value as NotificationLocale)
    : defaultNotificationLocale;
}

/** `YYYY-MM-DD` in die Datumsschreibweise der Empfänger-Locale. */
export function formatNotificationDate(value: string, locale: NotificationLocale) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return locale === "en" ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}

export function formatNotificationDateTime(value: Date, locale: NotificationLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(value);
}

/** Ein Datumsbereich; `end` fehlt bei offenen Zeiträumen (z. B. laufende Krankmeldung). */
export function formatNotificationRange(
  start: string,
  end: string | null,
  locale: NotificationLocale,
) {
  const from = formatNotificationDate(start, locale);

  if (!end) {
    return locale === "en" ? `from ${from}` : `ab ${from}`;
  }

  return `${from} – ${formatNotificationDate(end, locale)}`;
}

export type NotificationMessage =
  | {
      key: "vacationDecided";
      tenantName: string;
      startDate: string;
      endDate: string;
      status: "approved" | "rejected";
    }
  | {
      key: "shiftPlanPublished";
      tenantName: string;
      /** Kalenderwoche als Zahl — die Beschriftung ("KW"/"Week") kommt aus der Sprache. */
      week: number;
      weekRange: string;
      shifts: Array<{ date: string; startTime: string; endTime: string }>;
    }
  | {
      key: "absenceConflict";
      tenantName: string;
      employeeName: string;
      reason: "vacation" | "sickness";
      startDate: string;
      endDate: string | null;
    }
  | {
      key: "newVacationRequest";
      tenantName: string;
      employeeName: string;
      startDate: string;
      endDate: string;
    }
  | {
      key: "newSicknessReport";
      tenantName: string;
      employeeName: string;
      startDate: string;
    }
  | {
      key: "infoRequest";
      tenantName: string;
      title: string;
      dueAt: Date | null;
    }
  | {
      key: "newWishFreeRequest";
      tenantName: string;
      employeeName: string;
      date: string;
      reason: string;
    }
  | {
      key: "wishFreeDecided";
      tenantName: string;
      date: string;
      status: "approved" | "rejected";
      rejectReason: string;
    }
  | {
      key: "reminderDigest";
      tenantName: string;
      /** `dueDate` ist hier bereits der gespeicherte Anzeigewert der Erinnerung. */
      reminders: Array<{ title: string; dueDate: string }>;
    };

export type RenderedNotification = {
  subject: string;
  text: string;
  html: string;
};

function paragraph(html: string) {
  return `<p style="font-size:14px;">${html}</p>`;
}

/** Minimal-Escaping für die HTML-Variante — Namen/Titel kommen aus Nutzereingaben. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * `compact` kürzt Aufzählungen, die nur in E-Mail und Push sinnvoll sind.
 * Der In-App-Posteingang bekommt stattdessen eine anklickbare Zeile.
 */
type RenderOptions = { compact?: boolean };

export function renderNotification(
  message: NotificationMessage,
  locale: NotificationLocale,
  options?: RenderOptions,
): RenderedNotification {
  const isEn = locale === "en";

  switch (message.key) {
    case "vacationDecided": {
      const range = formatNotificationRange(message.startDate, message.endDate, locale);
      const decision = isEn
        ? message.status === "approved"
          ? "approved"
          : "rejected"
        : message.status === "approved"
          ? "genehmigt"
          : "abgelehnt";
      const subject = isEn ? `Vacation request ${decision}` : `Urlaubsantrag ${decision}`;
      const text = isEn
        ? `Your vacation request for ${range} at ${message.tenantName} was ${decision}.`
        : `Ihr Urlaubsantrag für ${range} bei ${message.tenantName} wurde ${decision}.`;
      const html = isEn
        ? paragraph(
            `Your vacation request for <strong>${escapeHtml(range)}</strong> at ${escapeHtml(message.tenantName)} was <strong>${decision}</strong>.`,
          )
        : paragraph(
            `Ihr Urlaubsantrag für <strong>${escapeHtml(range)}</strong> bei ${escapeHtml(message.tenantName)} wurde <strong>${decision}</strong>.`,
          );

      return { subject, text, html };
    }

    case "shiftPlanPublished": {
      const sorted = [...message.shifts].sort((a, b) =>
        a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
      );
      // Im Posteingang steht statt der Einzeltage nur die Anzahl: die Zeile
      // ist dort anklickbar und führt direkt in die betreffende Woche des
      // Schichtplans, wo dieselben Angaben ohnehin vollständig stehen.
      if (options?.compact) {
        const weekLabelCompact = isEn ? `week ${message.week}` : `KW ${message.week}`;
        const count = isEn
          ? sorted.length === 1
            ? "1 shift"
            : `${sorted.length} shifts`
          : sorted.length === 1
            ? "1 Schicht"
            : `${sorted.length} Schichten`;

        const compactText = isEn
          ? `Your shift plan for ${weekLabelCompact} (${message.weekRange}) at ${message.tenantName} has been published: ${count}.`
          : `Ihr Schichtplan für ${weekLabelCompact} (${message.weekRange}) bei ${message.tenantName} wurde veröffentlicht: ${count}.`;

        return {
          subject: isEn
            ? `Shift plan for week ${message.week} published`
            : `Schichtplan KW ${message.week} veröffentlicht`,
          text: compactText,
          html: paragraph(escapeHtml(compactText)),
        };
      }

      const lines = sorted.map(
        (shift) =>
          `${formatNotificationDate(shift.date, locale)}, ${shift.startTime}–${shift.endTime}`,
      );
      const weekLabel = isEn ? `week ${message.week}` : `KW ${message.week}`;
      const subject = isEn
        ? `Shift plan for week ${message.week} published`
        : `Schichtplan KW ${message.week} veröffentlicht`;
      const intro = isEn
        ? `Your shift plan for ${weekLabel} (${message.weekRange}) at ${message.tenantName} has been published:`
        : `Ihr Schichtplan für ${weekLabel} (${message.weekRange}) bei ${message.tenantName} wurde veröffentlicht:`;
      const introHtml = isEn
        ? `Your shift plan for <strong>${escapeHtml(weekLabel)}</strong> (${escapeHtml(message.weekRange)}) at ${escapeHtml(message.tenantName)} has been published:`
        : `Ihr Schichtplan für <strong>${escapeHtml(weekLabel)}</strong> (${escapeHtml(message.weekRange)}) bei ${escapeHtml(message.tenantName)} wurde veröffentlicht:`;

      return {
        subject,
        text: `${intro}\n\n${lines.join("\n")}`,
        html: `${paragraph(introHtml)}<ul style="font-size:14px;padding-left:18px;">${lines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul>`,
      };
    }

    case "absenceConflict": {
      const range = formatNotificationRange(message.startDate, message.endDate, locale);
      const reason = isEn
        ? message.reason === "vacation"
          ? "approved vacation"
          : "a sick leave report"
        : message.reason === "vacation"
          ? "genehmigten Urlaub"
          : "eine Krankmeldung";
      const subject = isEn
        ? `Shift plan conflict: ${message.employeeName}`
        : `Schichtplan-Konflikt: ${message.employeeName}`;
      const text = isEn
        ? `${message.employeeName} already has published shifts between ${range}, although there is now ${reason} for that period. Please review the shift plan at ${message.tenantName}.`
        : `${message.employeeName} hat bereits veröffentlichte Schichten im Zeitraum ${range}, obwohl jetzt ${reason} für diesen Zeitraum vorliegt. Bitte den Schichtplan bei ${message.tenantName} prüfen.`;
      const html = isEn
        ? paragraph(
            `${escapeHtml(message.employeeName)} already has published shifts between <strong>${escapeHtml(range)}</strong>, although there is now ${reason} for that period. Please review the shift plan at ${escapeHtml(message.tenantName)}.`,
          )
        : paragraph(
            `${escapeHtml(message.employeeName)} hat bereits veröffentlichte Schichten im Zeitraum <strong>${escapeHtml(range)}</strong>, obwohl jetzt ${reason} für diesen Zeitraum vorliegt. Bitte den Schichtplan bei ${escapeHtml(message.tenantName)} prüfen.`,
          );

      return { subject, text, html };
    }

    case "newVacationRequest": {
      const range = formatNotificationRange(message.startDate, message.endDate, locale);
      const subject = isEn
        ? `New vacation request from ${message.employeeName}`
        : `Neuer Urlaubsantrag von ${message.employeeName}`;
      const text = isEn
        ? `${message.employeeName} requested vacation for ${range} at ${message.tenantName}.`
        : `${message.employeeName} hat Urlaub für ${range} bei ${message.tenantName} beantragt.`;
      const html = isEn
        ? paragraph(
            `${escapeHtml(message.employeeName)} requested vacation for <strong>${escapeHtml(range)}</strong> at ${escapeHtml(message.tenantName)}.`,
          )
        : paragraph(
            `${escapeHtml(message.employeeName)} hat Urlaub für <strong>${escapeHtml(range)}</strong> bei ${escapeHtml(message.tenantName)} beantragt.`,
          );

      return { subject, text, html };
    }

    case "newSicknessReport": {
      const since = formatNotificationDate(message.startDate, locale);
      const subject = isEn
        ? `Sick leave report from ${message.employeeName}`
        : `Krankmeldung von ${message.employeeName}`;
      const text = isEn
        ? `${message.employeeName} reported sick since ${since} at ${message.tenantName}.`
        : `${message.employeeName} hat sich seit ${since} bei ${message.tenantName} krankgemeldet.`;
      const html = isEn
        ? paragraph(
            `${escapeHtml(message.employeeName)} reported sick since <strong>${escapeHtml(since)}</strong> at ${escapeHtml(message.tenantName)}.`,
          )
        : paragraph(
            `${escapeHtml(message.employeeName)} hat sich seit <strong>${escapeHtml(since)}</strong> bei ${escapeHtml(message.tenantName)} krankgemeldet.`,
          );

      return { subject, text, html };
    }

    case "infoRequest": {
      const dueLine = message.dueAt
        ? isEn
          ? ` Please respond by ${formatNotificationDateTime(message.dueAt, locale)}.`
          : ` Bitte bis ${formatNotificationDateTime(message.dueAt, locale)} Uhr antworten.`
        : "";
      const subject = isEn
        ? `New information request: ${message.title}`
        : `Neue Info-Anfrage: ${message.title}`;
      const text = isEn
        ? `${message.tenantName} is asking you for information: "${message.title}".${dueLine}`
        : `${message.tenantName} bittet Sie um Informationen: "${message.title}".${dueLine}`;
      const html = isEn
        ? paragraph(
            `${escapeHtml(message.tenantName)} is asking you for information: <strong>${escapeHtml(message.title)}</strong>.${escapeHtml(dueLine)}`,
          )
        : paragraph(
            `${escapeHtml(message.tenantName)} bittet Sie um Informationen: <strong>${escapeHtml(message.title)}</strong>.${escapeHtml(dueLine)}`,
          );

      return { subject, text, html };
    }

    case "newWishFreeRequest": {
      const date = formatNotificationDate(message.date, locale);
      const reasonLine = message.reason
        ? isEn
          ? ` Reason: ${message.reason}`
          : ` Begründung: ${message.reason}`
        : "";
      const subject = isEn
        ? `Day-off request from ${message.employeeName}`
        : `Wunschfrei-Anfrage von ${message.employeeName}`;
      const text = isEn
        ? `${message.employeeName} requested ${date} off at ${message.tenantName}.${reasonLine}`
        : `${message.employeeName} hat für den ${date} Wunschfrei bei ${message.tenantName} angefragt.${reasonLine}`;
      const html = isEn
        ? paragraph(
            `${escapeHtml(message.employeeName)} requested <strong>${escapeHtml(date)}</strong> off at ${escapeHtml(message.tenantName)}.${escapeHtml(reasonLine)}`,
          )
        : paragraph(
            `${escapeHtml(message.employeeName)} hat für den <strong>${escapeHtml(date)}</strong> Wunschfrei bei ${escapeHtml(message.tenantName)} angefragt.${escapeHtml(reasonLine)}`,
          );

      return { subject, text, html };
    }

    case "wishFreeDecided": {
      const date = formatNotificationDate(message.date, locale);
      const decision = isEn
        ? message.status === "approved"
          ? "approved"
          : "rejected"
        : message.status === "approved"
          ? "genehmigt"
          : "abgelehnt";
      const reasonLine = message.rejectReason
        ? isEn
          ? ` Reason: ${message.rejectReason}`
          : ` Begründung: ${message.rejectReason}`
        : "";
      const subject = isEn ? `Day-off request ${decision}` : `Wunschfrei ${decision}`;
      const text = isEn
        ? `Your day-off request for ${date} at ${message.tenantName} was ${decision}.${reasonLine}`
        : `Ihre Wunschfrei-Anfrage für den ${date} bei ${message.tenantName} wurde ${decision}.${reasonLine}`;
      const html = isEn
        ? paragraph(
            `Your day-off request for <strong>${escapeHtml(date)}</strong> at ${escapeHtml(message.tenantName)} was <strong>${decision}</strong>.${escapeHtml(reasonLine)}`,
          )
        : paragraph(
            `Ihre Wunschfrei-Anfrage für den <strong>${escapeHtml(date)}</strong> bei ${escapeHtml(message.tenantName)} wurde <strong>${decision}</strong>.${escapeHtml(reasonLine)}`,
          );

      return { subject, text, html };
    }

    case "reminderDigest": {
      const count = message.reminders.length;
      const subject = isEn
        ? `${count} reminder(s) due at ${message.tenantName}`
        : `${count} fällige Erinnerung(en) bei ${message.tenantName}`;
      const intro = isEn
        ? `Reminders due this week at ${message.tenantName}:`
        : `Diese Woche fällige Erinnerungen bei ${message.tenantName}:`;
      const lines = message.reminders.map((reminder) =>
        isEn
          ? `- ${reminder.title} (due ${reminder.dueDate})`
          : `- ${reminder.title} (fällig ${reminder.dueDate})`,
      );
      const htmlLines = message.reminders
        .map((reminder) =>
          isEn
            ? `<li>${escapeHtml(reminder.title)} — due ${escapeHtml(reminder.dueDate)}</li>`
            : `<li>${escapeHtml(reminder.title)} — fällig ${escapeHtml(reminder.dueDate)}</li>`,
        )
        .join("");

      return {
        subject,
        text: `${intro}\n\n${lines.join("\n")}`,
        html: `${paragraph(escapeHtml(intro))}<ul style="font-size:14px;">${htmlLines}</ul>`,
      };
    }
  }
}
