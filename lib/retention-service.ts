import "server-only";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { createSystemTenantReminder } from "@/lib/reminders";
import { assertEmployeeInScope, requireTenantAccess } from "@/lib/tenant-access";
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
      userId: true,
    },
  });

  return candidates.filter(
    (candidate) => candidate.offboardedAt && retentionCutoff("personaldaten", candidate.offboardedAt, now),
  );
}

/**
 * Anonymisiert die Kategorie-1-Stammdaten eines ehemaligen Mitarbeiters
 * (Name, Geburtsdaten, Kontaktdaten, Adresse, Notfallkontakte, Namens-Slug,
 * Konto-Verknüpfung) sowie Namens-Schnappschüsse dieser Person in anderen
 * Modellen (Standort-Leitung, zugewiesene Dateien) — vorher blieben diese
 * über `key` (namensbasierter Slug), `userId` (verknüpftes Benutzerkonto)
 * und in `TenantLocation`/`TenantFile` kopierte Namensfelder weiterhin
 * zuordenbar (Audit-Finding M05). KEIN vollständiger Verarbeitungsgraph über
 * alle Modelle — deckt nur die konkret im Finding genannten Fälle ab, siehe
 * Umsetzungsstatus im Audit für den Rest.
 *
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
  userId?: string | null;
}) {
  const anonymizedName = `Ehemalige/r Mitarbeiter/in #${employee.employeeNumber}`;
  const anonymizedKey = `anon-${employee.employeeNumber}`.toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.tenantEmployee.update({
      where: { id: employee.id },
      data: {
        name: anonymizedName,
        // Namensbasierter Slug (Routing/URLs) — bliebe sonst auch nach der
        // Anonymisierung des Anzeigenamens zuordenbar (Audit-Finding M05).
        key: anonymizedKey,
        initials: "EM",
        birthDate: "",
        birthPlace: "",
        nationality: "",
        maritalStatus: "",
        phone: "",
        email: "",
        emergencyContactsJson: "[]",
        // Trennt die Verknüpfung zum Benutzerkonto — sonst bliebe die
        // Personalakte über `userId` weiterhin einer echten, identifizierten
        // Person zuordenbar (Audit-Finding M05).
        userId: null,
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

    // Standort-Leitungs-Schnappschuss (name/Initialen/Telefon/E-Mail) wird
    // laut Datenmodell nur beim Speichern des Standorts aufgefrischt, nicht
    // automatisch bei Änderungen am Mitarbeiter — bliebe sonst dauerhaft mit
    // dem alten Klarnamen stehen.
    await tx.tenantLocation.updateMany({
      where: { tenantId: employee.tenantId, leadEmployeeId: employee.id },
      data: {
        leadEmployeeId: null,
        leadName: "Keine Leitung",
        leadInitials: "--",
        leadPhone: "",
        leadEmail: "",
      },
    });

    // Datei-Zuweisungs-Namensfeld (separat von der Datei-Eigentümerschaft
    // über `employeeId`, siehe Schema) — derselbe Snapshot-Charakter.
    await tx.tenantFile.updateMany({
      where: { tenantId: employee.tenantId, assignedEmployeeId: employee.id },
      data: { assignedEmployeeId: "", assignedEmployeeName: "" },
    });

    // Team-/Standort-Mitgliedslisten führen denselben Name/Initialen-
    // Schnappschuss wie die Standort-Leitung oben (siehe
    // syncTeamMemberSnapshots/syncLocationTeamSnapshots in
    // employee-service.ts) — blieben bisher außen vor und zeigten den
    // Klarnamen weiterhin in jeder Team-/Standort-Mitgliederliste
    // (Audit-Finding M05).
    await tx.tenantTeamMember.updateMany({
      where: { employeeId: employee.id },
      data: { name: anonymizedName, initials: "EM" },
    });
    await tx.tenantLocationMember.updateMany({
      where: { employeeId: employee.id },
      data: { name: anonymizedName, initials: "EM" },
    });
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
 * Löscht abgelaufene Cookie-Consent-Nachweise (Kategorie "consent_nachweis")
 * — bisher gar nicht automatisch bereinigt (Audit-Finding M05).
 */
export async function purgeExpiredConsentRecords(now: Date = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_POLICIES.consent_nachweis.months);

  const result = await prisma.consentRecord.deleteMany({ where: { createdAt: { lt: cutoff } } });

  return { deleted: result.count };
}

/**
 * Löscht gestempelte Arbeitszeiten (TenantTimeEntry inkl. Pausen) nach Ablauf
 * der Kategorie "arbeitszeit" (§16 Abs. 2 ArbZG, §17 MiLoG: 2 Jahre ab
 * Erfassung). Mitarbeiter mit Legal Hold bleiben unberührt. Außerdem das
 * Versandprotokoll der Stempel-Erinnerungen (nur Duplikatschutz, nach einer
 * Woche ohne Zweck).
 */
export async function purgeExpiredTimeEntries(now: Date = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_POLICIES.arbeitszeit.months);

  const [entries, reminders] = await Promise.all([
    prisma.tenantTimeEntry.deleteMany({
      where: { clockInAt: { lt: cutoff }, employee: { legalHold: false } },
    }),
    prisma.tenantTimeClockReminder.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
    }),
  ]);

  return { deleted: entries.count, remindersDeleted: reminders.count };
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

  // Legal Hold sperrte bisher nur die Kategorie "personaldaten" — eine
  // abgelaufene Gehaltsabrechnung/Krankmeldung ließ sich über die jeweils
  // ANDERE Kategorie trotz Hold weiter löschen (Audit-Finding H12).
  if (employee.legalHold) {
    const reason = `Gesperrt durch Legal Hold: ${employee.legalHoldReason || "kein Grund angegeben"}.`;
    results.push(
      { category: "lohn_sozialversicherung", eligible: false, reason, blockedUntil: null },
      { category: "gesundheit_freitext", eligible: false, reason, blockedUntil: null },
    );
    return results;
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
 * Zentrale Löschprüfung für eine einzelne Datei — bislang konnten
 * `softDeleteTenantFile` und der periodische Purge eine Datei direkt
 * löschen, ohne Legal Hold des verknüpften Mitarbeiters oder die
 * gesetzliche Aufbewahrungsfrist von Gehaltsabrechnungen/Krankmeldungs-
 * Anhängen zu prüfen (Audit-Finding H12). Allgemeine Personalakten-
 * Dokumente ohne eigene gesetzliche Frist (Kategorie "personaldaten")
 * sind davon nicht betroffen.
 */
export async function assertFileDeletionAllowed(
  tenantId: string,
  file: { id: string; employeeId: string | null; parentId?: string | null },
) {
  if (!file.employeeId) {
    return;
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: file.employeeId, tenantId },
    select: { legalHold: true, legalHoldReason: true },
  });

  if (employee?.legalHold) {
    throw new Error(
      `Löschung gesperrt: Legal Hold (${employee.legalHoldReason || "kein Grund angegeben"}).`,
    );
  }

  // Die Vertrags-/Abrechnungs-/Krankheits-FK zeigt nach einem Versionswechsel
  // (uploadTenantFileVersion) nur noch auf die NEUE Version — eine bereits
  // "replaced" alte Version verlöre ihre Gehalts-/Krankheits-Aufbewahrungs-
  // frist, sobald sie (z. B. durch den periodischen Purge) direkt anhand
  // ihrer eigenen ID geprüft wird. Deshalb hier über den ganzen
  // Versionenverbund (Wurzeldokument + alle Versionen) nachschlagen, nicht
  // nur `file.id` (Audit-Finding H12).
  const rootId = file.parentId ?? file.id;
  const family = await prisma.tenantFile.findMany({
    where: { OR: [{ id: rootId }, { parentId: rootId }] },
    select: { id: true },
  });
  const familyIds = family.length > 0 ? family.map((entry) => entry.id) : [file.id];

  const [payroll, sickness] = await Promise.all([
    prisma.tenantPayrollStatement.findFirst({
      where: { fileId: { in: familyIds } },
      select: { issuedAt: true },
    }),
    prisma.tenantSicknessReport.findFirst({
      where: { attachmentFileId: { in: familyIds } },
      select: { closedAt: true },
    }),
  ]);

  if (payroll && !retentionCutoff("lohn_sozialversicherung", payroll.issuedAt)) {
    throw new Error(
      `Löschung gesperrt: Aufbewahrungsfrist für Gehaltsabrechnungen (${RETENTION_POLICIES.lohn_sozialversicherung.legalBasis}) noch nicht abgelaufen.`,
    );
  }

  if (sickness?.closedAt && !retentionCutoff("gesundheit_freitext", sickness.closedAt)) {
    throw new Error(
      "Löschung gesperrt: Aufbewahrungsfrist für Krankmeldungs-Anhänge noch nicht abgelaufen.",
    );
  }
}

type PurgeCandidateFile = {
  id: string;
  tenantId: string;
  employeeId: string | null;
  parentId?: string | null;
};

/**
 * Batch-Variante von `assertFileDeletionAllowed` für den periodischen Purge
 * (Audit-Finding aus dem Heimdall-Scan: der Cleanup-Cron rief die Einzel-
 * prüfung bisher in einer Schleife auf — bis zu vier Queries PRO Datei. Hier
 * werden Legal-Hold-, Versionsfamilien- und Gehalts-/Krankheits-Aufbewahrungs-
 * Daten für alle übergebenen Dateien in je einer Abfrage geholt und die
 * eigentliche Prüfung danach rein im Speicher durchgeführt — dieselbe Logik
 * wie oben, nur gebündelt statt pro Datei.
 */
export async function assertFileDeletionAllowedBatch<T extends PurgeCandidateFile>(
  files: T[],
): Promise<{ allowed: T[]; blocked: Array<{ file: T; reason: string }> }> {
  const employeeIds = [...new Set(files.flatMap((file) => (file.employeeId ? [file.employeeId] : [])))];
  const employees = employeeIds.length
    ? await prisma.tenantEmployee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, tenantId: true, legalHold: true, legalHoldReason: true },
      })
    : [];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const rootIdByFileId = new Map(files.map((file) => [file.id, file.parentId ?? file.id]));
  const rootIds = [...new Set(rootIdByFileId.values())];
  const rootIdSet = new Set(rootIds);

  const familyRows = rootIds.length
    ? await prisma.tenantFile.findMany({
        where: { OR: [{ id: { in: rootIds } }, { parentId: { in: rootIds } }] },
        select: { id: true, parentId: true },
      })
    : [];

  const familyIdsByRoot = new Map<string, string[]>();
  for (const row of familyRows) {
    if (rootIdSet.has(row.id)) {
      familyIdsByRoot.set(row.id, [...(familyIdsByRoot.get(row.id) ?? []), row.id]);
    }
    if (row.parentId && rootIdSet.has(row.parentId)) {
      familyIdsByRoot.set(row.parentId, [...(familyIdsByRoot.get(row.parentId) ?? []), row.id]);
    }
  }

  const familyIdsByFileId = new Map(
    files.map((file) => {
      const rootId = rootIdByFileId.get(file.id)!;
      const family = familyIdsByRoot.get(rootId);
      return [file.id, family && family.length > 0 ? family : [file.id]];
    }),
  );

  const allFamilyFileIds = [...new Set([...familyIdsByFileId.values()].flat())];

  const [payrollRows, sicknessRows] = allFamilyFileIds.length
    ? await Promise.all([
        prisma.tenantPayrollStatement.findMany({
          where: { fileId: { in: allFamilyFileIds } },
          select: { fileId: true, issuedAt: true },
        }),
        prisma.tenantSicknessReport.findMany({
          where: { attachmentFileId: { in: allFamilyFileIds } },
          select: { attachmentFileId: true, closedAt: true },
        }),
      ])
    : [[], []];

  const payrollByFileId = new Map(payrollRows.map((row) => [row.fileId, row]));
  const sicknessByFileId = new Map(
    sicknessRows
      .filter((row) => row.attachmentFileId !== null)
      .map((row) => [row.attachmentFileId as string, row]),
  );

  const allowed: T[] = [];
  const blocked: Array<{ file: T; reason: string }> = [];

  for (const file of files) {
    const employee = file.employeeId ? employeeById.get(file.employeeId) : undefined;

    if (employee?.legalHold && employee.tenantId === file.tenantId) {
      blocked.push({
        file,
        reason: `Löschung gesperrt: Legal Hold (${employee.legalHoldReason || "kein Grund angegeben"}).`,
      });
      continue;
    }

    const familyIds = familyIdsByFileId.get(file.id) ?? [file.id];
    const payroll = familyIds.map((id) => payrollByFileId.get(id)).find(Boolean);
    const sickness = familyIds.map((id) => sicknessByFileId.get(id)).find(Boolean);

    if (payroll && !retentionCutoff("lohn_sozialversicherung", payroll.issuedAt)) {
      blocked.push({
        file,
        reason: `Löschung gesperrt: Aufbewahrungsfrist für Gehaltsabrechnungen (${RETENTION_POLICIES.lohn_sozialversicherung.legalBasis}) noch nicht abgelaufen.`,
      });
      continue;
    }

    if (sickness?.closedAt && !retentionCutoff("gesundheit_freitext", sickness.closedAt)) {
      blocked.push({
        file,
        reason: "Löschung gesperrt: Aufbewahrungsfrist für Krankmeldungs-Anhänge noch nicht abgelaufen.",
      });
      continue;
    }

    allowed.push(file);
  }

  return { allowed, blocked };
}

/**
 * Wie `assertFileDeletionAllowed`, aber für den direkten
 * Alles-löschen-Pfad (`deleteTenantEmployee`) — prüft Legal Hold und JEDE
 * vorhandene Gehaltsabrechnung/Krankmeldungs-Freitext des Mitarbeiters,
 * nicht nur eine einzelne Datei. Bewusst NICHT `getDeletionEligibilityForEmployee`
 * wiederverwendet: dessen "eligible"-Flag bedeutet dort auch "Kategorie ist
 * leer/nicht anwendbar" (z. B. keine Gehaltsabrechnungen vorhanden) — das
 * wäre hier kein Löschgrund, sondern würde eine ansonsten zulässige
 * Löschung fälschlich blockieren.
 */
export async function assertEmployeeDeletionAllowed(tenantId: string, employeeId: string) {
  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: employeeId, tenantId },
    select: { legalHold: true, legalHoldReason: true },
  });

  if (employee?.legalHold) {
    throw new Error(
      `Löschung gesperrt: Legal Hold (${employee.legalHoldReason || "kein Grund angegeben"}).`,
    );
  }

  const payrollStatements = await prisma.tenantPayrollStatement.findMany({
    where: { employeeId },
    select: { issuedAt: true },
  });

  if (payrollStatements.some((s) => !retentionCutoff("lohn_sozialversicherung", s.issuedAt))) {
    throw new Error(
      `Löschung gesperrt: Aufbewahrungsfrist für mindestens eine Gehaltsabrechnung (${RETENTION_POLICIES.lohn_sozialversicherung.legalBasis}) noch nicht abgelaufen. Für teilweise Löschung „Kategorien-Löschantrag" verwenden.`,
    );
  }

  // Gestempelte Arbeitszeiten (§16 Abs. 2 ArbZG, §17 MiLoG) — ein Löschen
  // der Personalakte würde sie per Kaskade mitnehmen.
  const newestTimeEntry = await prisma.tenantTimeEntry.findFirst({
    where: { employeeId },
    orderBy: { clockInAt: "desc" },
    select: { clockInAt: true },
  });

  if (newestTimeEntry && !retentionCutoff("arbeitszeit", newestTimeEntry.clockInAt)) {
    throw new Error(
      `Löschung gesperrt: Aufbewahrungsfrist für erfasste Arbeitszeiten (${RETENTION_POLICIES.arbeitszeit.legalBasis}) noch nicht abgelaufen.`,
    );
  }

  const sicknessReports = await prisma.tenantSicknessReport.findMany({
    where: { employeeId, status: "closed", note: { not: "" } },
    select: { closedAt: true },
  });

  if (
    sicknessReports.some(
      (r) => r.closedAt && !retentionCutoff("gesundheit_freitext", r.closedAt),
    )
  ) {
    throw new Error(
      'Löschung gesperrt: Aufbewahrungsfrist für mindestens einen Krankmeldungs-Freitext noch nicht abgelaufen. Für teilweise Löschung „Kategorien-Löschantrag" verwenden.',
    );
  }
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

  // Der Level-Guard (`canDelete`) allein prüft keinen Objektscope — ein
  // own-/team-gescoptes Löschrecht konnte über eine mitgeschickte fremde
  // `employeeId` trotzdem Kategorien beliebiger Mitarbeiter im Mandanten
  // löschen (Audit-Finding H05).
  await assertEmployeeInScope(access, employeeId);

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
        select: {
          id: true,
          tenantId: true,
          employeeNumber: true,
          privateAddressId: true,
          workAddressId: true,
          userId: true,
        },
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
