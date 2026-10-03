import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTenantEmployeeRecord,
  getEmployeesForTenant,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { getTeamsForTenant } from "@/lib/team-service";

/**
 * Integrationstest gegen die echte Test-DB für die Kern-Schreibpfade der
 * Mitarbeiterverwaltung — insbesondere die auf JOIN-Tabellen normalisierten
 * Relationen (timeline, contractDetails; siehe Migration
 * 20260812000000_normalize_legacy_json_columns), die zuvor als reine
 * JSON-Blob-Spalten liefen und dafür keinerlei Testabdeckung hatten.
 *
 * `updateTenantEmployee` hängt (anders als `createTenantEmployeeRecord`)
 * über `requireEmployeeManager` an next/headers()/der echten Session — dafür
 * wird hier minimal gemockt, mit einem echten OWNER-Fixture-Nutzer als
 * "angemeldetem" Akteur.
 */

let actorUserId: string;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: actorUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-employee-service-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Employee Service Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const actor = await prisma.user.create({
    data: {
      email: `actor-${RUN_ID}@ployo.invalid`,
      name: "Test Actor",
      emailVerified: true,
    },
  });
  actorUserId = actor.id;

  await prisma.tenantMembership.create({
    data: { tenantId, userId: actor.id, role: "OWNER" },
  });

  await prisma.tenantLocation.createMany({
    data: [
      { tenantId, key: `standort-a-${RUN_ID}`, kind: "Filiale", name: "Standort A" },
      { tenantId, key: `standort-b-${RUN_ID}`, kind: "Filiale", name: "Standort B" },
    ],
  });

  await prisma.tenantRole.createMany({
    data: [
      { tenantId, key: `entwicklerin-${RUN_ID}`, name: "Entwicklerin" },
      { tenantId, key: `tech-lead-${RUN_ID}`, name: "Tech Lead" },
    ],
  });

  await prisma.tenantTeam.createMany({
    data: [
      { tenantId, key: `labor-${RUN_ID}`, name: "Labor" },
      { tenantId, key: `krypto-${RUN_ID}`, name: "Krypto" },
    ],
  });
});

afterAll(async () => {
  // `EmployeeAddress` wird von TenantEmployee referenziert (nicht umgekehrt)
  // und hat kein `onDelete: Cascade` in diese Richtung — jede hier angelegte
  // Personalakte legt beim Anlegen automatisch eine (leere) Privat- und
  // Arbeitsadresse an, die Tenant-Löschung räumt sie aber nicht mit ab (genau
  // deshalb räumt `deleteTenantEmployee` sie im echten Code explizit auf,
  // siehe lib/employee-service.ts). Ohne diesen Schritt hier bleiben bei
  // jedem Testlauf verwaiste `EmployeeAddress`-Zeilen zurück.
  const employees = await prisma.tenantEmployee.findMany({
    where: { tenantId },
    select: { privateAddressId: true, workAddressId: true },
  });
  const addressIds = employees
    .flatMap((employee) => [employee.privateAddressId, employee.workAddressId])
    .filter((id): id is string => Boolean(id));

  await prisma.tenant.deleteMany({ where: { id: tenantId } });

  if (addressIds.length) {
    await prisma.employeeAddress.deleteMany({ where: { id: { in: addressIds } } });
  }

  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("createTenantEmployeeRecord", () => {
  it("legt einen Mitarbeiter mit Timeline- und ContractDetails-Relation an", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${RUN_ID}@ployo.invalid`,
        location: "",
        team: "",
        role: "",
      },
    });

    expect(employee.name).toBe("Ada Lovelace");
    expect(employee.timeline).toHaveLength(1);
    expect(employee.timeline[0]).toMatchObject({
      title: "Mitarbeiter angelegt",
      tone: "success",
    });
    expect(employee.contractDetails.linkedFileMeta).toBe("Noch nicht hochgeladen");
    expect(employee.contractDetails.clauses).toEqual([]);

    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId },
      include: { timeline: true, contractDetails: true },
    });
    expect(stored.timeline).toHaveLength(1);
    expect(stored.contractDetails).not.toBeNull();
  });

  it("ordnet einen Mitarbeiter mit mehreren Teams auch den echten Team-Rostern (TenantTeamMember) zu", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        // Bewusst kein Name, der mit anderen Testfällen im File kollidiert
        // (z. B. "Mar..." aus dem Standortfilter-Block unten, der exakte
        // Ergebnislisten erwartet).
        firstName: "Dorothy",
        lastName: "Vaughan",
        email: `dorothy-teams-${RUN_ID}@ployo.invalid`,
        teams: ["Labor", "Krypto"],
        role: "",
      },
    });

    // Primärteam (Freitext-Spalte, für own/team-Scopes) ist das erste
    // ausgewählte Team.
    expect(employee.team).toBe("Labor");
    expect(employee.teams).toEqual(["Labor", "Krypto"]);

    const teams = await getTeamsForTenant(tenantSlug);
    const teamsWithEmployee = teams.filter((team) =>
      team.members.some((member) => member.employeeId === employee.dbId),
    );
    expect(teamsWithEmployee.map((team) => team.name).sort()).toEqual([
      "Krypto",
      "Labor",
    ]);
  });

  it("lehnt eine bereits vergebene E-Mail case-insensitiv ab (QA-Bug BUG-005)", async () => {
    const email = `duplicate-check-${RUN_ID}@ployo.invalid`;

    await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Grace",
        lastName: "Hopper",
        email,
        location: "",
        team: "",
        role: "",
      },
    });

    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: {
          tenantSlug,
          firstName: "Grace",
          lastName: "Hopper-Zweite",
          email: email.toUpperCase(),
          location: "",
          team: "",
          role: "",
        },
      }),
    ).rejects.toThrow(/bereits/i);

    // Leere E-Mail bleibt weiterhin mehrfach erlaubt.
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: {
          tenantSlug,
          firstName: "Ohne",
          lastName: `Email-${RUN_ID}-1`,
          email: "",
          location: "",
          team: "",
          role: "",
        },
      }),
    ).resolves.toBeTruthy();
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: {
          tenantSlug,
          firstName: "Ohne",
          lastName: `Email-${RUN_ID}-2`,
          email: "",
          location: "",
          team: "",
          role: "",
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("updateTenantEmployee", () => {
  it("hängt bei Standort-/Rollenänderung neue Timeline-Einträge an, ohne alte zu verlieren", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Grace",
        lastName: "Hopper",
        email: `grace-${RUN_ID}@ployo.invalid`,
        location: "Standort A",
        role: "Entwicklerin",
      },
    });

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      location: "Standort B",
      role: "Tech Lead",
    });

    expect(updated.timeline).toHaveLength(3);
    const titles = updated.timeline.map((entry) => entry.title);
    expect(titles).toContain("Mitarbeiter angelegt");
    expect(titles).toContain("Standort geändert: Standort A → Standort B");
    expect(titles).toContain("Rolle geändert: Entwicklerin → Tech Lead");

    // Neueste zuerst.
    expect(updated.timeline[0].title).not.toBe("Mitarbeiter angelegt");
  });

  it("bewahrt manuell erfasste Vertragsdetails über ein Update hinweg", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Katherine",
        lastName: "Johnson",
        email: `katherine-${RUN_ID}@ployo.invalid`,
      },
    });

    await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      contractDetailsSubmitted: true,
      position: "Mathematikerin",
      department: "Forschung",
    });

    const secondUpdate = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      // Kein contractDetailsSubmitted-Flag: bestehende Werte sollen bleiben.
      phone: "+49 30 1234567",
    });

    expect(secondUpdate.contractDetails.position).toBe("Mathematikerin");
    expect(secondUpdate.contractDetails.department).toBe("Forschung");
    expect(secondUpdate.phone).toBe("+49 30 1234567");
  });

  it("synchronisiert TenantTeamMember bei Teamänderung, lässt sie aber bei unbeteiligten Feldern unangetastet", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        // Kein "...mar..."-Substring im Namen (siehe Kommentar oben) — sonst
        // taucht die Fixtur im Standortfilter-Block unten in der
        // "Mar"-Suche auf.
        firstName: "Annie",
        lastName: "Easley",
        email: `annie-${RUN_ID}@ployo.invalid`,
      },
    });

    const membershipsOf = () =>
      prisma.tenantTeamMember.findMany({ where: { employeeId: created.dbId! } });

    expect(await membershipsOf()).toHaveLength(0);

    // Team(s) explizit setzen — muss die echten Team-Roster treffen (der
    // gemeldete Bug: bisher landete das nur in `TenantEmployee.team`).
    const withTeams = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      teams: ["Labor", "Krypto"],
    });

    expect(withTeams.team).toBe("Labor");
    expect(withTeams.teams?.slice().sort()).toEqual(["Krypto", "Labor"]);
    expect((await membershipsOf()).map((m) => m.teamId).sort()).toEqual(
      (
        await prisma.tenantTeam.findMany({
          where: { tenantId, name: { in: ["Labor", "Krypto"] } },
          select: { id: true },
        })
      )
        .map((t) => t.id)
        .sort(),
    );

    // Ein unbeteiligtes Feld ändern (weder `team` noch `teams` mitgeschickt)
    // darf die Team-Zuordnung weder leeren noch sonst anfassen.
    const unrelatedUpdate = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      phone: "+49 30 9876543",
    });

    expect(unrelatedUpdate.team).toBe("Labor");
    expect(await membershipsOf()).toHaveLength(2);

    // Alle Teams explizit entfernen (leeres Array) muss die Roster-Zeilen
    // wirklich löschen, nicht nur die Freitext-Spalte leeren.
    const cleared = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      teams: [],
    });

    expect(cleared.team).toBe("");
    expect(await membershipsOf()).toHaveLength(0);
  });

  it("lehnt beim Bearbeiten die E-Mail eines anderen Mitarbeiters ab, erlaubt aber die eigene unveränderte (QA-Bug BUG-005)", async () => {
    const first = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Emmy",
        lastName: `Noether-${RUN_ID}`,
        email: `emmy-email-update-${RUN_ID}@ployo.invalid`,
      },
    });
    const second = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Barbara",
        lastName: `McClintock-${RUN_ID}`,
        email: `barbara-email-update-${RUN_ID}@ployo.invalid`,
      },
    });

    await expect(
      updateTenantEmployee({
        tenantSlug,
        employeeId: second.dbId!,
        email: first.email.toUpperCase(),
      }),
    ).rejects.toThrow(/bereits/i);

    // Die eigene, unveränderte E-Mail erneut mitschicken darf nicht an sich selbst scheitern.
    await expect(
      updateTenantEmployee({
        tenantSlug,
        employeeId: second.dbId!,
        email: second.email,
        phone: "+49 30 1111111",
      }),
    ).resolves.toBeTruthy();
  });
});

describe("getEmployeesForTenant — Suche und Standortfilter", () => {
  /** Eigene Fixtures mit unverwechselbaren Namen, damit die anderen Blöcke nicht hineinzählen. */
  const names = ["Marie Curie", "Alan Turing", "Rosalind Franklin"];
  const employeeNumbers: Record<string, string> = {};

  beforeAll(async () => {
    const fixtures = [
      { firstName: "Marie", lastName: "Curie", location: "Standort A", team: "Labor" },
      { firstName: "Alan", lastName: "Turing", location: "Standort B", team: "Krypto" },
      { firstName: "Rosalind", lastName: "Franklin", location: "Standort A", team: "Labor" },
    ];

    for (const fixture of fixtures) {
      const created = await createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: {
          tenantSlug,
          ...fixture,
          email: `${fixture.firstName.toLowerCase()}-${RUN_ID}@ployo.invalid`,
          role: "",
        },
      });

      employeeNumbers[created.name] = created.employeeNumber;
    }
  });

  const namesOf = async (filters?: Parameters<typeof getEmployeesForTenant>[1]) =>
    ((await getEmployeesForTenant(tenantSlug, filters)) ?? []).map((e) => e.name);

  it("findet über einen Teil des Namens, unabhängig von der Groß-/Kleinschreibung", async () => {
    expect(await namesOf({ search: "curie" })).toEqual(["Marie Curie"]);
    expect(await namesOf({ search: "CURIE" })).toEqual(["Marie Curie"]);
    expect(await namesOf({ search: "Mar" })).toEqual(["Marie Curie"]);
  });

  it("findet über die Personalnummer", async () => {
    const number = employeeNumbers["Alan Turing"];

    expect(await namesOf({ search: number })).toEqual(["Alan Turing"]);
  });

  it("findet über das Team", async () => {
    const found = await namesOf({ search: "Labor" });

    expect(found).toContain("Marie Curie");
    expect(found).toContain("Rosalind Franklin");
    expect(found).not.toContain("Alan Turing");
  });

  it("filtert nach Standort", async () => {
    const found = await namesOf({ location: "Standort B" });

    expect(found).toContain("Alan Turing");
    expect(found).not.toContain("Marie Curie");
  });

  it("kombiniert Suche und Standortfilter als UND", async () => {
    expect(await namesOf({ search: "Labor", location: "Standort A" })).toEqual([
      "Marie Curie",
      "Rosalind Franklin",
    ]);

    // Team "Labor" gibt es an Standort B nicht — die Kombination darf nichts liefern.
    expect(await namesOf({ search: "Labor", location: "Standort B" })).toEqual([]);
  });

  it("behandelt fehlende und leere Filter als 'kein Filter'", async () => {
    const unfiltered = await namesOf();

    for (const name of names) {
      expect(unfiltered).toContain(name);
    }

    // Ein geleertes Suchfeld schickt "" bzw. Leerzeichen — das darf nicht
    // versehentlich auf "Name enthält Leerzeichen" filtern.
    expect(await namesOf({ search: "", location: "" })).toEqual(unfiltered);
    expect(await namesOf({ search: "   " })).toEqual(unfiltered);
  });

  it("liefert eine leere Liste statt eines Fehlers, wenn nichts passt", async () => {
    expect(await namesOf({ search: "gibtesnicht-xyz" })).toEqual([]);
  });

  it("behandelt % und _ als literale Zeichen statt als SQL-LIKE-Wildcards (QA-Bug BUG-012)", async () => {
    // Kein Mitarbeiter-Fixture enthält ein literales "%" oder "_" im Namen —
    // eine buchstäbliche Suche danach darf daher 0 Treffer liefern, nicht
    // "alle" (wie bei einem unescaped ILIKE-Wildcard).
    expect(await namesOf({ search: "%" })).toEqual([]);
    expect(await namesOf({ search: "_" })).toEqual([]);
    // "L%a" bzw. "L_na" dürfen nicht als Muster ("L" + irgendwas + "a"/"na")
    // interpretiert werden und z. B. "Alan Turing" treffen.
    expect(await namesOf({ search: "L%a" })).toEqual([]);
    expect(await namesOf({ search: "L_na" })).toEqual([]);
    // Ein normaler Teiltreffer funktioniert daneben weiterhin.
    expect(await namesOf({ search: "Alan" })).toEqual(["Alan Turing"]);
  });
});
