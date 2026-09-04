import "server-only";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { createSystemTenantReminder } from "@/lib/reminders";
import { requireTenantAccess } from "@/lib/tenant-access";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { RETENTION_POLICIES, retentionCutoff, retentionExpiryDate, type RetentionCategory } from "@/lib/data-retention";

const ANONYMIZED_ADDRESS_FIELDS = {
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  careOf: "",
  country: "DE",
};

/**
 * Ehemalige Mitarbeiter, deren Kategorie-"personaldaten"-Frist abgelaufen
 * ist und die noch nicht anonymisiert wurden. `offboardedAt` wird erst seit
 * Einführung dieses Löschkonzepts gesetzt (offboardEmployee) — bereits vor
 * der Einführung ausgeschiedene Mitarbeiter (offboardedAt = null) fallen
 * bewusst NICHT automatisch darunter, um kein bestehendes Datum
 * rückwirkend/überraschend zu erfassen. Ein Nachziehen für Altfälle wäre ein
 * separater, bewusster Schritt.
 */
export async function findEmployeesDueForPersonaldatenAnonymisierung(now: Date = new Date()) {
  const candidates = await prisma.tenantEmployee.findMany({
    where: {
      status: "former",
      legalHold: false,
      piiAnonymizedAt: null,
      offboardedAt: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      employeeNumber: true,
      offboardedAt: true,
      privateAddressId: true,
      workAddressId: true,
    },
  });

  return candidates.filter(
    (candidate) => candidate.offboardedAt && retentionCutoff("personaldaten", candidate.offboardedAt, now),
  );
}

/**
 * Anonymisiert die Kategorie-1-Stammdaten eines ehemaligen Mitarbeiters
 * (Name, Geburtsdaten, Kontaktdaten, Adresse, Notfallkontakte).
 * Lohn-/SV-relevante Felder (taxId, socialSecurityNumber, healthInsurance,
 * iban) sowie Vertrags-/Gehaltsdatensätze bleiben unangetastet — die laufen
 * unter der eigenen, längeren Kategorie-"lohn_sozialversicherung"-Frist
 * weiter, verknüpft nur noch über die intern bleibende `employeeNumber`.
 */
export async function anonymizeFormerEmployeePii(employee: {
  id: string;
  tenantId: string;
  employeeNumber: string;
  privateAddressId: string | null;
  workAddressId: string | null;
}) {
  const anonymizedName = `Ehemalige/r Mitarbeiter/in #${employee.employeeNumber}`;

  await prisma.$transaction(async (tx) => {
    await tx.tenantEmployee.update({
      where: { id: employee.id },
      data: {
        name: anonymizedName,
        initials: "EM",
        birthDate: "",
        birthPlace: "",
        nationality: "",
        maritalStatus: "",
        phone: "",
        email: "",
        emergencyContactsJson: "[]",
        piiAnonymizedAt: new Date(),
      },
    });

    if (employee.privateAddressId) {
      await tx.employeeAddress.update({
        where: { id: employee.privateAddressId },
        data: ANONYMIZED_ADDRESS_FIELDS,
      });
    }

    if (employee.workAddressId) {
      await tx.employeeAddress.update({
        where: { id: employee.workAddressId },
        data: ANONYMIZED_ADDRESS_FIELDS,
      });
    }
  });

  await recordTenantAudit({
    tenantId: employee.tenantId,
    actorId: "system",
    actorName: "System (Löschkonzept)",
    action: "Personaldaten automatisch anonymisiert",
    source: "Cron",
    entityType: "employee",
    entityId: employee.id,
    detail: `Kategorie "personaldaten" (${RETENTION_POLICIES.personaldaten.months} Monate, ${RETENTION_POLICIES.personaldaten.legalBasis}) abgelaufen.`,
  });
}

/**
 * Abgeschlossene Krankmeldungen, deren Gesundheitsdaten-Frist für den
 * Freitext (`note`) abgelaufen ist. Löscht NICHTS automatisch (Art. 9
 * DSGVO-Daten, siehe Umbauplan) — legt stattdessen eine Erinnerung für HR an
 * (`TenantReminder`, bereits existierendes Modell), damit der Freitext
 * manuell geprüft/geleert werden kann.
 */
export async function remindHrAboutExpiredHealthDataFreetext(now: Date = new Date()) {
  const candidates = await prisma.tenantSicknessReport.findMany({
    where: { status: "closed", closedAt: { not: null }, note: { not: "" } },
    select: { id: true, tenantId: true, closedAt: true, employee: { select: { name: true } } },
  });

  const due = candidates.filter(
    (candidate) => candidate.closedAt && retentionCutoff("gesundheit_freitext", candidate.closedAt, now),
  );

  let created = 0;
  for (const candidate of due) {
    const dueDate = now.toISOString().slice(0, 10);
    const { created: wasCreated } = await createSystemTenantReminder({
      tenantId: candidate.tenantId,
      title: `Gesundheitsdaten prüfen: Krankmeldung ${candidate.id}`,
      dueDate,
      priority: "important",
      subject: `Freitext-Notiz einer Krankmeldung von ${candidate.employee.name} ist seit über ${RETENTION_POLICIES.gesundheit_freitext.months} Monaten abgeschlossen`,
      category: "Löschkonzept",
      notes:
        `Rechtsgrundlage: ${RETENTION_POLICIES.gesundheit_freitext.legalBasis}. ` +
        "Bitte prüfen, ob die Freitext-Notiz noch benötigt wird, und ggf. manuell leeren (reine Fehlzeit-Metadaten bleiben unberührt).",
    });
    if (wasCreated) {
      created += 1;
    }
  }

  return { checked: candidates.length, remindersCreated: created };
}

export type CategoryEligibility = {
  category: RetentionCategory;
  /** true, wenn die Kategorie jetzt (ganz oder teilweise) löschbar ist. */
  eligible: boolean;
  /** Menschlich lesbarer Grund, warum (noch) nicht bzw. ab wann gelöscht werden darf. */
  reason: string;
  blockedUntil: string | null;
};

/**
 * Löschfähigkeit pro Kategorie für den gezielten Einzelfall-Löschantrag
 * (z. B. Art. 17 DSGVO-Anfrage eines ehemaligen Mitarbeiters an den Kunden).
 * Ersetzt das heutige Alles-oder-nichts von `deleteTenantEmployee` durch
 * eine Pro-Kategorie-Sicht: was ist sofort löschbar, was ist wegen
 * gesetzlicher Aufbewahrungspflicht (noch) gesperrt, und ab wann nicht mehr.
 */
export async function getDeletionEligibilityForEmployee(
  tenantSlug: string,
  employeeId: string,
): Promise<CategoryEligibility[]> {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: employeeId, tenantId: access.tenantId },
    select: { offboardedAt: true, legalHold: true, legalHoldReason: true, piiAnonymizedAt: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const now = new Date();
  const results: CategoryEligibility[] = [];

  if (employee.piiAnonymizedAt) {
    results.push({
      category: "personaldaten",
      eligible: false,
      reason: "Bereits anonymisiert.",
      blockedUntil: null,
    });
  } else if (employee.legalHold) {
    results.push({
      category: "personaldaten",
      eligible: false,
      reason: `Gesperrt durch Legal Hold: ${employee.legalHoldReason || "kein Grund angegeben"}.`,
      blockedUntil: null,
    });
  } else if (!employee.offboardedAt) {
    results.push({
      category: "personaldaten",
      eligible: false,
      reason: "Mitarbeiter ist nicht ausgeschieden.",
      blockedUntil: null,
    });
  } else {
    const expiry = retentionExpiryDate("personaldaten", employee.offboardedAt);
    const eligible = expiry <= now;
    results.push({
      category: "personaldaten",
      eligible,
      reason: eligible
        ? `Verjährungsfrist (${RETENTION_POLICIES.personaldaten.legalBasis}) abgelaufen.`
        : `Gesperrt bis ${expiry.toISOString().slice(0, 10)} (${RETENTION_POLICIES.personaldaten.legalBasis}).`,
      blockedUntil: eligible ? null : expiry.toISOString().slice(0, 10),
    });
  }

  const payrollStatements = await prisma.tenantPayrollStatement.findMany({
    where: { employeeId },
    select: { issuedAt: true },
  });
  const payrollExpiries = payrollStatements.map((statement) =>
    retentionExpiryDate("lohn_sozialversicherung", statement.issuedAt),
  );
  const payrollEligibleNow = payrollExpiries.filter((expiry) => expiry <= now).length;
  const latestBlockedPayroll = payrollExpiries
    .filter((expiry) => expiry > now)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  results.push({
    category: "lohn_sozialversicherung",
    eligible: payrollExpiries.length > 0 && payrollEligibleNow === payrollExpiries.length,
    reason:
      payrollExpiries.length === 0
        ? "Keine Gehaltsabrechnungen vorhanden."
        : payrollEligibleNow === payrollExpiries.length
          ? `Alle ${payrollExpiries.length} Gehaltsabrechnung(en) sind über die Frist hinaus (${RETENTION_POLICIES.lohn_sozialversicherung.legalBasis}).`
          : `${payrollEligibleNow}/${payrollExpiries.length} Gehaltsabrechnung(en) löschbar, Rest gesperrt bis ${latestBlockedPayroll?.toISOString().slice(0, 10)} (${RETENTION_POLICIES.lohn_sozialversicherung.legalBasis}).`,
    blockedUntil: latestBlockedPayroll ? latestBlockedPayroll.toISOString().slice(0, 10) : null,
  });

  const sicknessReports = await prisma.tenantSicknessReport.findMany({
    where: { employeeId, status: "closed", note: { not: "" } },
    select: { closedAt: true },
  });
  const sicknessExpiries = sicknessReports
    .filter((report): report is { closedAt: Date } => Boolean(report.closedAt))
    .map((report) => retentionExpiryDate("gesundheit_freitext", report.closedAt));
  const sicknessEligibleNow = sicknessExpiries.filter((expiry) => expiry <= now).length;
  const latestBlockedSickness = sicknessExpiries
    .filter((expiry) => expiry > now)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  results.push({
    category: "gesundheit_freitext",
    eligible: sicknessExpiries.length > 0 && sicknessEligibleNow === sicknessExpiries.length,
    reason:
      sicknessExpiries.length === 0
        ? "Keine Freitext-Notizen in Krankmeldungen vorhanden."
        : sicknessEligibleNow === sicknessExpiries.length
          ? `Alle ${sicknessExpiries.length} Krankmeldungs-Freitext(e) über der Frist (${RETENTION_POLICIES.gesundheit_freitext.legalBasis}).`
          : `${sicknessEligibleNow}/${sicknessExpiries.length} löschbar, Rest gesperrt bis ${latestBlockedSickness?.toISOString().slice(0, 10)}.`,
    blockedUntil: latestBlockedSickness ? latestBlockedSickness.toISOString().slice(0, 10) : null,
  });

  return results;
}

/**
 * Löscht/anonymisiert genau die angeforderten, tatsächlich löschfähigen
 * Kategorien für einen Mitarbeiter — nie mehr, als `getDeletionEligibilityForEmployee`
 * als löschfähig ausweist. Ersetzt das Alles-oder-nichts von
 * `deleteTenantEmployee` für den Fall eines gezielten Löschantrags.
 */
export async function deleteEmployeeDataByCategory(
  tenantSlug: string,
  employeeId: string,
  categories: RetentionCategory[],
) {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const eligibility = await getDeletionEligibilityForEmployee(tenantSlug, employeeId);
  const eligibilityByCategory = new Map(eligibility.map((entry) => [entry.category, entry]));
  const results: Array<{ category: RetentionCategory; performed: boolean; detail: string }> = [];

  for (const category of categories) {
    const status = eligibilityByCategory.get(category);

    if (!status?.eligible) {
      results.push({
        category,
        performed: false,
        detail: status?.reason ?? "Unbekannte Kategorie.",
      });
      continue;
    }

    if (category === "personaldaten") {
      const employee = await prisma.tenantEmployee.findFirst({
        where: { id: employeeId, tenantId: access.tenantId },
        select: { id: true, tenantId: true, employeeNumber: true, privateAddressId: true, workAddressId: true },
      });
      if (employee) {
        await anonymizeFormerEmployeePii(employee);
      }
      results.push({ category, performed: true, detail: "Stammdaten anonymisiert." });
    } else if (category === "lohn_sozialversicherung") {
      const now = new Date();
      const statements = await prisma.tenantPayrollStatement.findMany({
        where: { employeeId, tenantId: access.tenantId },
        select: { id: true, issuedAt: true, fileId: true, file: { select: { bucket: true, storageKey: true } } },
      });
      const due = statements.filter(
        (statement) => retentionExpiryDate("lohn_sozialversicherung", statement.issuedAt) <= now,
      );

      await prisma.tenantPayrollStatement.deleteMany({ where: { id: { in: due.map((s) => s.id) } } });
      await purgeTenantFiles(due.map((s) => ({ id: s.fileId, ...s.file })));

      results.push({
        category,
        performed: due.length > 0,
        detail: `${due.length} Gehaltsabrechnung(en) inkl. Datei gelöscht.`,
      });
    } else if (category === "gesundheit_freitext") {
      const now = new Date();
      const reports = await prisma.tenantSicknessReport.findMany({
        where: { employeeId, tenantId: access.tenantId, status: "closed", note: { not: "" } },
        select: { id: true, closedAt: true, attachmentFileId: true, attachmentFile: { select: { bucket: true, storageKey: true } } },
      });
      const due = reports.filter((report) => report.closedAt && retentionExpiryDate("gesundheit_freitext", report.closedAt) <= now);

      for (const report of due) {
        await prisma.tenantSicknessReport.update({ where: { id: report.id }, data: { note: "" } });
      }
      const attachmentsToPurge = due
        .filter((report) => report.attachmentFileId && report.attachmentFile)
        .map((report) => ({ id: report.attachmentFileId as string, ...report.attachmentFile! }));
      await purgeTenantFiles(attachmentsToPurge);

      results.push({
        category,
        performed: due.length > 0,
        detail: `${due.length} Krankmeldungs-Freitext(e) geleert, ${attachmentsToPurge.length} Anlage(n) gelöscht.`,
      });
    }
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Gezielter Löschantrag ausgeführt",
    source: "Personalakte",
    entityType: "employee",
    entityId: employeeId,
    detail: results.map((r) => `${r.category}: ${r.performed ? "durchgeführt" : "übersprungen"} (${r.detail})`).join("; "),
  });

  return results;
}
