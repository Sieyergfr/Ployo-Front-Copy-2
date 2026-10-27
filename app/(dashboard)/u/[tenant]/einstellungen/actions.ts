"use server";

import {
  updateTenantDefaults,
  updateTenantNotifications,
  updateTenantProfile,
  updateTenantSecurity,
  updateLocationHolidayRegion,
  updateTenantShiftSettings,
  updateTenantTimeTracking,
} from "@/lib/settings-service";
import { updateAccountName, updateOwnPreferences } from "@/lib/account-service";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_DAYS } from "@/lib/locale-shared";
import { cookies } from "next/headers";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { createBillingCheckoutSession, createBillingPortalSession } from "@/lib/billing-service";
import { isStripeConfigured } from "@/lib/stripe/client";
import { normalizeBillingCycle, normalizePlan } from "@/lib/tenants";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function formBool(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

/** Formular schickt Wochentag/Uhrzeit/Aktiv-Checkbox getrennt — hier zu `"<wochentag>-<HHMM>"` zusammensetzen (Tag/Uhrzeit sind frei wählbar). */
function digestTimeFromForm(formData: FormData) {
  if (!formBool(formData, "digestEnabled")) {
    return "disabled";
  }

  const weekday = formString(formData, "digestWeekday", "monday");
  const timeOfDay = formString(formData, "digestTimeOfDay", "08:00");
  const hhmm = timeOfDay.replace(":", "").padEnd(4, "0").slice(0, 4);

  return `${weekday}-${hhmm}`;
}

function settingsPath(tenant: string) {
  return `/u/${tenant}/einstellungen`;
}

function absoluteTenantUrl(tenant: string, returnPath = "") {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Nur Rücksprünge innerhalb des eigenen Mandanten (z. B. zurück zur Einstellungsseite).
  return returnPath.startsWith(`/u/${tenant}/`) ? `${baseUrl}${returnPath}` : `${baseUrl}/u/${tenant}`;
}

/**
 * Speichert bewusst ohne `redirect()`: das Popup bleibt beim Speichern über
 * jeder Seite offen (Navigation.tsx), ein Redirect auf `/u/${tenant}` würde
 * es von der aktuellen Seite wegreißen und wirkte wie ein ungewolltes
 * Schließen. `useActionState` in Navigation.tsx zeigt stattdessen eine
 * "Gespeichert"-Bestätigung im Popup selbst.
 */
export async function saveSettingsPopupAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");
  const category = formString(formData, "category", "account");

  if (!tenant) {
    return { error: "Einstellungen konnten nicht gespeichert werden." };
  }

  try {
    await saveSettingsPopupCategory(tenant, category, formData);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Einstellungen konnten nicht gespeichert werden.",
    };
  }

  revalidatePath(`/u/${tenant}`);
  revalidatePath(settingsPath(tenant));

  return {};
}

async function saveSettingsPopupCategory(
  tenant: string,
  category: string,
  formData: FormData,
) {
  if (category === "account") {
    await updateAccountName(formString(formData, "accountName"));
  }

  if (category === "company") {
    await updateTenantProfile({
      tenantSlug: tenant,
      name: formString(formData, "companyName"),
      slug: formString(formData, "tenantId"),
      country: formString(formData, "country"),
      timezone: formString(formData, "timezone"),
      size: formString(formData, "size"),
      industry: formString(formData, "industry"),
      contactEmail: formString(formData, "contactEmail"),
      logoUrl: formString(formData, "logoUrl"),
      primaryColor: formString(formData, "primaryColor"),
      plan: formString(formData, "plan"),
      billingCycle: formString(formData, "billingCycle"),
    });

    await updateTenantDefaults({
      tenantSlug: tenant,
      companyAddress: {
        street: formString(formData, "companyAddressStreet"),
        houseNumber: formString(formData, "companyAddressHouseNumber"),
        postalCode: formString(formData, "companyAddressPostalCode"),
        city: formString(formData, "companyAddressCity"),
        careOf: formString(formData, "companyAddressCareOf"),
        country: formString(formData, "companyAddressCountry", "DE"),
      },
      taxId: formString(formData, "taxId"),
      defaultLocationId: formString(formData, "defaultLocation"),
      weekStart: formString(formData, "weekStart"),
      workHours: formString(formData, "workHours"),
      vacationDays: formString(formData, "vacationDays"),
      employeeNumberRequired: formBool(formData, "employeeNumberRequired"),
      employeeNumberPrefix: formString(formData, "employeeNumberPrefix"),
      employeeNumberSuffix: formString(formData, "employeeNumberSuffix"),
      archiveFormerEmployees: formBool(formData, "archiveFormerEmployees"),
    });
  }

  if (category === "notifications") {
    await updateTenantNotifications({
      tenantSlug: tenant,
      mailNotifications: formBool(formData, "mailNotifications"),
      inAppNotifications: formBool(formData, "inAppNotifications"),
      mobilePush: formBool(formData, "mobilePush"),
      deadlineAlerts: formBool(formData, "deadlineAlerts"),
      absenceAlerts: formBool(formData, "absenceAlerts"),
      shiftAlerts: formBool(formData, "shiftAlerts"),
      digestTime: digestTimeFromForm(formData),
    });
  }

  if (category === "timeTracking") {
    await updateTenantTimeTracking({
      tenantSlug: tenant,
      enabled: formBool(formData, "timeTrackingEnabled"),
      breaksEnabled: formBool(formData, "timeTrackingBreaksEnabled"),
      autoBreakDeduction: formBool(formData, "timeTrackingAutoBreakDeduction"),
      clockInMode: formString(formData, "timeTrackingClockInMode", "always"),
      clockInLeadMinutes: formString(formData, "timeTrackingClockInLeadMinutes"),
      reminderPush: formBool(formData, "timeTrackingReminderPush"),
      autoClockOut: formBool(formData, "timeTrackingAutoClockOut"),
      autoClockOutAfterShiftMinutes: formString(formData, "timeTrackingAutoClockOutAfterShiftMinutes"),
      autoClockOutMaxHours: formString(formData, "timeTrackingAutoClockOutMaxHours"),
      qrRequired: formBool(formData, "timeTrackingQrRequired"),
      qrRequiredClockOut: formBool(formData, "timeTrackingQrRequiredClockOut"),
    });
  }

  if (category === "security") {
    // Der Sicherheit-Tab ist inzwischen für alle Mitglieder sichtbar (siehe
    // Navigation.tsx), das Auswahlfeld dort aber ohne "settings:write"
    // deaktiviert. Ein Submit sollte für diese Mitglieder trotzdem nicht
    // mit einem ungefangenen FORBIDDEN abbrechen, falls doch versucht wird
    // zu speichern (deaktivierte Felder werden zwar nicht mitgesendet, aber
    // sicherheitshalber hier abgefangen statt auf die UI zu vertrauen).
    await updateTenantSecurity({
      tenantSlug: tenant,
      twoFactorRequired: formBool(formData, "twoFactorRequired"),
      auditRetentionMonths: formString(formData, "auditRetentionMonths"),
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.message === "FORBIDDEN")) {
        throw error;
      }
    });
  }

  // Sobald Stripe konfiguriert ist, lassen sich Plan/Abrechnungsintervall
  // nicht mehr direkt speichern — das wuerde eine bezahlte Aenderung
  // vortaeuschen. Der Wechsel laeuft dann ueber Checkout/Billing-Portal
  // (startBillingCheckoutAction/openBillingPortalAction unten).
  if (category === "billing" && !isStripeConfigured()) {
    await updateTenantProfile({
      tenantSlug: tenant,
      name: formString(formData, "companyName"),
      slug: formString(formData, "tenantId"),
      country: formString(formData, "country"),
      timezone: formString(formData, "timezone"),
      size: formString(formData, "size"),
      industry: formString(formData, "industry"),
      contactEmail: formString(formData, "receiptEmail"),
      logoUrl: formString(formData, "logoUrl"),
      primaryColor: formString(formData, "primaryColor"),
      plan: formString(formData, "planSelection") || formString(formData, "plan"),
      billingCycle: formString(formData, "paymentInterval"),
    });
  }
}

export async function startBillingCheckoutAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    if (!tenant) {
      throw new Error("Checkout konnte nicht gestartet werden.");
    }

    const returnUrl = absoluteTenantUrl(tenant, formString(formData, "returnPath"));
    const checkoutUrl = await createBillingCheckoutSession({
      tenantSlug: tenant,
      plan: normalizePlan(formString(formData, "planSelection")),
      billingCycle: normalizeBillingCycle(formString(formData, "paymentInterval")),
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    });

    redirect(checkoutUrl);
  }, "Checkout starten");
}

export async function openBillingPortalAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    if (!tenant) {
      throw new Error("Zahlungsverwaltung konnte nicht geöffnet werden.");
    }

    const portalUrl = await createBillingPortalSession({
      tenantSlug: tenant,
      returnUrl: absoluteTenantUrl(tenant, formString(formData, "returnPath")),
      intent: formString(formData, "portalIntent") === "switch-plan" ? "switch-plan" : undefined,
    });

    redirect(portalUrl);
  }, "Zahlungsverwaltung öffnen");
}

// ---------------------------------------------------------------------------
// Einstellungsseite (/u/[tenant]/einstellungen) — speichert abschnittsweise
// ohne Weiterleitung. Dieselben Service-Funktionen und Feldnamen wie der
// bisherige Dialog.
// ---------------------------------------------------------------------------

export type SettingsSectionState = ActionState & { slug?: string };

const SETTINGS_VALIDATION_MESSAGES = new Set([
  "Unternehmensname ist erforderlich.",
  "Diese Arbeitsbereich-URL ist nicht erlaubt.",
  "Diese Arbeitsbereich-URL ist bereits vergeben.",
]);

export async function saveSettingsSectionAction(formData: FormData): Promise<SettingsSectionState> {
  const tenant = formString(formData, "tenant");
  const category = formString(formData, "category", "account");
  let slug = tenant;

  const state = await withActionErrorHandling(async () => {
    if (!tenant) {
      return { error: "Einstellungen konnten nicht gespeichert werden." };
    }

    try {
      await saveSettingsPopupCategory(tenant, category, formData);
    } catch (error) {
      // Prüfmeldungen der Einstellungen direkt anzeigen (wie im bisherigen Dialog),
      // ohne sie der gemeinsamen API-Fehlerliste der App hinzuzufügen.
      if (error instanceof Error && SETTINGS_VALIDATION_MESSAGES.has(error.message)) {
        return { error: error.message };
      }

      throw error;
    }

    if (category === "company") {
      slug = (await getTenantSlugAfterSave(formString(formData, "tenantId"))) || tenant;
    }

    revalidatePath(`/u/${slug}`, "layout");
  }, "Einstellungen speichern");

  return slug !== tenant && !state.error ? { ...state, slug } : state;
}

/** Die URL wird beim Speichern normalisiert (slugify) — dieselbe Regel wie im Service. */
async function getTenantSlugAfterSave(requested: string) {
  const { slugify } = await import("@/lib/slug");

  return slugify(requested);
}

export async function savePreferencesSectionAction(formData: FormData): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const language = formString(formData, "language", "de");

    await updateOwnPreferences({
      language,
      timezone: formString(formData, "timezone"),
      startPage: formString(formData, "startPage"),
      dateFormat: formString(formData, "dateFormat"),
      notifyVacationEvents: formBool(formData, "notifyVacationEvents"),
      notifyShiftEvents: formBool(formData, "notifyShiftEvents"),
      pushEnabled: formBool(formData, "pushEnabled"),
    });

    // Wie der Sprachumschalter: Sprache auch für Seiten ohne Anmeldung merken.
    (await cookies()).set(LOCALE_COOKIE, language === "en" ? "en" : "de", {
      maxAge: LOCALE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
    });
    revalidatePath("/", "layout");
  }, "Einstellungen speichern");
}

export async function saveShiftSettingsSectionAction(formData: FormData): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    await updateTenantShiftSettings({
      tenantSlug: tenant,
      weekStart: formString(formData, "weekStart"),
      minStaffing: formString(formData, "minStaffing"),
      breakRule: formString(formData, "breakRule"),
      presetsJson: formString(formData, "presets", "[]"),
      defaultOpeningHoursJson: formString(formData, "defaultOpeningHours", "[]"),
      minRestHours: formString(formData, "minRestHours"),
      maxShiftHours: formString(formData, "maxShiftHours"),
      overtimeWarningPercent: formString(formData, "overtimeWarningPercent"),
      notifyOnPublish: formBool(formData, "notifyOnPublish"),
    });

    revalidatePath(`/u/${tenant}`, "layout");
  }, "Planungseinstellungen speichern");
}

export async function saveHolidayRegionAction(input: { tenant: string; locationId: string; bundesland: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await updateLocationHolidayRegion({
      tenantSlug: String(input.tenant),
      locationId: String(input.locationId),
      bundesland: String(input.bundesland),
    });

    revalidatePath(`/u/${input.tenant}`, "layout");
  }, "Feiertage speichern");
}
