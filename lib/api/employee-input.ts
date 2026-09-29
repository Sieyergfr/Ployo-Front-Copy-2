import "server-only";

/**
 * Whitelist der von der REST-API entgegengenommenen Mitarbeiter-Felder —
 * spiegelt `EmployeeMutationInput` aus lib/employee-service.ts (dort nicht
 * exportiert). Bewusst als Whitelist statt Body-Spread, damit ein Client
 * nicht versehentlich/böswillig `tenantSlug`/`employeeId` im Body
 * überschreiben kann (die werden immer serverseitig aus Pfad-Parametern
 * gesetzt).
 */
export type EmployeeApiInput = {
  firstName?: string;
  lastName?: string;
  name?: string;
  employeeNumber?: string;
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  maritalStatus?: string;
  privateAddress?: {
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
    careOf?: string;
    country?: string;
  };
  taxId?: string;
  socialSecurityNumber?: string;
  healthInsurance?: string;
  iban?: string;
  location?: string;
  /** "Mehrere Standorte pro Mitarbeiter" — hat Vorrang vor `location`, wenn beide gesetzt sind. */
  locations?: string[];
  team?: string;
  /** "Mehrere Teams pro Mitarbeiter" — hat Vorrang vor `team`, wenn beide gesetzt sind. */
  teams?: string[];
  role?: string;
  startDate?: string;
  contract?: string;
  weeklyHours?: string;
  tenure?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
    careOf?: string;
    country?: string;
  };
  vacationRemaining?: string;
  vacationTotal?: string;
  vacationTaken?: string;
  contractType?: string;
  entryDate?: string;
  exitDate?: string;
  fixedTerm?: string;
  probation?: string;
  noticePeriod?: string;
  position?: string;
  department?: string;
  supervisor?: string;
  workLocation?: string;
  parties?: string;
  collectiveAgreement?: string;
  compensation?: string;
  workingTime?: string;
  vacation?: string;
  contractDetailsSubmitted?: boolean;
  // id darf für neue Kontakte leer sein — lib/employee-service.ts vergibt
  // dann selbst eine neue id (randomUUID), s. updateTenantEmployee.
  emergencyContacts?: {
    id: string;
    name: string;
    relation: string;
    phone: string;
    email?: string;
    note?: string;
  }[];
};

const STRING_FIELDS = [
  "firstName", "lastName", "name", "employeeNumber", "birthDate", "birthPlace",
  "nationality", "maritalStatus", "taxId", "socialSecurityNumber", "healthInsurance",
  "iban", "location", "team", "role", "startDate", "contract", "weeklyHours",
  "tenure", "status", "email", "phone", "vacationRemaining", "vacationTotal",
  "vacationTaken", "contractType", "entryDate", "exitDate", "fixedTerm", "probation",
  "noticePeriod", "position", "department", "supervisor", "workLocation", "parties",
  "collectiveAgreement", "compensation", "workingTime", "vacation",
] as const satisfies readonly (keyof EmployeeApiInput)[];

const ADDRESS_FIELDS = ["street", "houseNumber", "postalCode", "city", "careOf", "country"] as const;

function pickAddress(value: unknown): EmployeeApiInput["address"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const address: Record<string, string> = {};

  for (const field of ADDRESS_FIELDS) {
    if (typeof source[field] === "string") {
      address[field] = source[field] as string;
    }
  }

  return address;
}

/** Whitelisted, typisierte Übernahme der API-Eingabe — kein Body-Spread. */
export function pickEmployeeInput(body: Record<string, unknown>): EmployeeApiInput {
  const input: EmployeeApiInput = {};

  for (const field of STRING_FIELDS) {
    if (typeof body[field] === "string") {
      input[field] = body[field] as string;
    }
  }

  const privateAddress = pickAddress(body.privateAddress);
  if (privateAddress) {
    input.privateAddress = privateAddress;
  }

  const address = pickAddress(body.address);
  if (address) {
    input.address = address;
  }

  if (typeof body.contractDetailsSubmitted === "boolean") {
    input.contractDetailsSubmitted = body.contractDetailsSubmitted;
  }

  if (Array.isArray(body.locations)) {
    input.locations = body.locations.filter((value): value is string => typeof value === "string");
  }

  if (Array.isArray(body.teams)) {
    input.teams = body.teams.filter((value): value is string => typeof value === "string");
  }

  if (Array.isArray(body.emergencyContacts)) {
    input.emergencyContacts = body.emergencyContacts
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : "",
        name: typeof entry.name === "string" ? entry.name : "",
        relation: typeof entry.relation === "string" ? entry.relation : "",
        phone: typeof entry.phone === "string" ? entry.phone : "",
        email: typeof entry.email === "string" ? entry.email : undefined,
        note: typeof entry.note === "string" ? entry.note : undefined,
      }));
  }

  return input;
}
