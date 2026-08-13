"use server";

import {
  createTenantInvitation,
  deleteTenantInvitation,
  updateTenantDefaults,
  updateTenantNotifications,
  updateTenantProfile,
  updateTenantSecurity,
} from "@/lib/settings-service";
import { updateAccountName } from "@/lib/account-service";
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

function settingsPath(tenant: string) {
  return `/u/${tenant}/einstellungen`;
}

function absoluteTenantUrl(tenant: string) {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return `${baseUrl}/u/${tenant}`;
}

export async function updateTenantProfileAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const slug = formString(formData, "slug");

  if (!tenant) {
    throw new Error("Einstellungen konnten nicht gespeichert werden.");
  }

  const updatedTenant = await updateTenantProfile({
    tenantSlug: tenant,
    name: formString(formData, "name"),
    slug,
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

  revalidatePath(`/u/${tenant}`);
  redirect(settingsPath(updatedTenant.slug));
}

export async function updateTenantDefaultsAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Standards konnten nicht gespeichert werden.");
  }

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
    defaultLocationId: formString(formData, "defaultLocationId"),
    weekStart: formString(formData, "weekStart"),
    workHours: formString(formData, "workHours"),
    vacationDays: formString(formData, "vacationDays"),
    employeeNumberRequired: formBool(formData, "employeeNumberRequired"),
    employeeNumberPrefix: formString(formData, "employeeNumberPrefix"),
    employeeNumberSuffix: formString(formData, "employeeNumberSuffix"),
    archiveFormerEmployees: formBool(formData, "archiveFormerEmployees"),
  });

  revalidatePath(settingsPath(tenant));
  redirect(settingsPath(tenant));
}

export async function updateTenantNotificationsAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Benachrichtigungen konnten nicht gespeichert werden.");
  }

  await updateTenantNotifications({
    tenantSlug: tenant,
    mailNotifications: formBool(formData, "mailNotifications"),
    inAppNotifications: formBool(formData, "inAppNotifications"),
    mobilePush: formBool(formData, "mobilePush"),
    deadlineAlerts: formBool(formData, "deadlineAlerts"),
    absenceAlerts: formBool(formData, "absenceAlerts"),
    shiftAlerts: formBool(formData, "shiftAlerts"),
    digestTime: formString(formData, "digestTime"),
  });

  revalidatePath(settingsPath(tenant));
  redirect(settingsPath(tenant));
}

export async function updateTenantSecurityAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Sicherheit konnte nicht gespeichert werden.");
  }

  await updateTenantSecurity({
    tenantSlug: tenant,
    twoFactorRequired: formBool(formData, "twoFactorRequired"),
    sessionTimeout: formBool(formData, "sessionTimeout"),
    auditRetentionMonths: formString(formData, "auditRetentionMonths"),
  });

  revalidatePath(settingsPath(tenant));
  redirect(settingsPath(tenant));
}

export async function createTenantInvitationAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Einladung konnte nicht erstellt werden.");
  }

  await createTenantInvitation({
    tenantSlug: tenant,
    email: formString(formData, "email"),
    role: formString(formData, "role"),
  });

  revalidatePath(settingsPath(tenant));
  redirect(settingsPath(tenant));
}

export async function deleteTenantInvitationAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const invitationId = formString(formData, "invitationId");

  if (!tenant || !invitationId) {
    throw new Error("Einladung konnte nicht gelöscht werden.");
  }

  await deleteTenantInvitation({
    tenantSlug: tenant,
    invitationId,
  });

  revalidatePath(settingsPath(tenant));
  redirect(settingsPath(tenant));
}

export async function saveSettingsPopupAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const category = formString(formData, "category", "account");

  if (!tenant) {
    throw new Error("Einstellungen konnten nicht gespeichert werden.");
  }

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
      digestTime: formString(formData, "digestTime"),
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

  revalidatePath(`/u/${tenant}`);
  redirect(`/u/${tenant}`);
}

export async function startBillingCheckoutAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Checkout konnte nicht gestartet werden.");
  }

  const returnUrl = absoluteTenantUrl(tenant);
  const checkoutUrl = await createBillingCheckoutSession({
    tenantSlug: tenant,
    plan: normalizePlan(formString(formData, "planSelection")),
    billingCycle: normalizeBillingCycle(formString(formData, "paymentInterval")),
    successUrl: returnUrl,
    cancelUrl: returnUrl,
  });

  redirect(checkoutUrl);
}

export async function openBillingPortalAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Zahlungsverwaltung konnte nicht geöffnet werden.");
  }

  const portalUrl = await createBillingPortalSession({
    tenantSlug: tenant,
    returnUrl: absoluteTenantUrl(tenant),
    intent: formString(formData, "portalIntent") === "switch-plan" ? "switch-plan" : undefined,
  });

  redirect(portalUrl);
}
