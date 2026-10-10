"use client";

import { switchLanguageAction } from "@/app/(dashboard)/konto/actions";
import {
  openBillingPortalAction,
  saveSettingsPopupAction,
  startBillingCheckoutAction,
} from "@/app/(dashboard)/u/[tenant]/einstellungen/actions";
import AddressFields from "@/components/AddressFields";
import type { AddressInput } from "@/lib/address";
import type { BillingInvoice } from "@/lib/billing-service";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast, useToast } from "@/components/Toasts";
import Checkbox from "@/components/inputs/checkbox";
import { useSlugAvailability } from "@/lib/hooks/useSlugAvailability";
import { permissionLevels, type PermissionLevel } from "@/lib/roles";
import { slugify } from "@/lib/slug";
import type { TenantPermissionArea } from "@/lib/tenant-access";
import {
  Bell,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Plug,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { createPortal } from "react-dom";

const availableLocales = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
] as const;

type NavItem = {
  labelKey: string;
  code: string;
  href: string;
  area?: TenantPermissionArea;
  requiredLevel?: PermissionLevel;
  /** Nur anzeigen, wenn der Mandant die Zeiterfassung aktiviert hat. */
  requiresTimeTracking?: boolean;
};

function hasRequiredLevel(actual: PermissionLevel, required: PermissionLevel) {
  return permissionLevels.indexOf(actual) >= permissionLevels.indexOf(required);
}

type TenantItem = {
  name: string;
  role: string;
  mark: string;
  href: string;
  colorClass: string;
  slug?: string;
  permissions?: Record<TenantPermissionArea, PermissionLevel>;
  country?: string;
  timezone?: string;
  size?: string;
  industry?: string;
  contactEmail?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  billingCycle?: string;
  stripeSubscriptionStatus?: string;
  stripeCancelAtPeriodEnd?: boolean;
  stripeCurrentPeriodEnd?: string;
  locations?: { id: string; name: string }[];
  settings?: {
    companyAddress: AddressInput | null;
    taxId: string;
    defaultLocationId: string;
    weekStart: string;
    workHours: string;
    vacationDays: number;
    employeeNumberRequired: boolean;
    employeeNumberPrefix: string;
    employeeNumberSuffix: string;
    archiveFormerEmployees: boolean;
    mailNotifications: boolean;
    inAppNotifications: boolean;
    mobilePush: boolean;
    deadlineAlerts: boolean;
    absenceAlerts: boolean;
    shiftAlerts: boolean;
    digestTime: string;
    twoFactorRequired: boolean;
    sessionTimeout: boolean;
    auditRetentionMonths: number;
    timeTrackingEnabled: boolean;
    timeTrackingBreaksEnabled: boolean;
    timeTrackingAutoBreakDeduction: boolean;
    timeTrackingClockInMode: string;
    timeTrackingClockInLeadMinutes: number;
    timeTrackingReminderPush: boolean;
    timeTrackingAutoClockOut: boolean;
    timeTrackingAutoClockOutAfterShiftMinutes: number;
    timeTrackingAutoClockOutMaxHours: number;
    timeTrackingQrRequired: boolean;
  };
};

export type NavigationTenantItem = TenantItem;

const navigationItems: NavItem[] = [
  { labelKey: "overview", code: "Üb", href: "" },
  { labelKey: "myArea", code: "Mb", href: "/mein-bereich" },
  { labelKey: "myTimes", code: "Zt", href: "/zeiten", requiresTimeTracking: true },
  { labelKey: "employees", code: "MA", href: "/employees", area: "employees" },
  { labelKey: "locations", code: "St", href: "/standorte", area: "locations" },
  { labelKey: "teams", code: "Tm", href: "/teams", area: "teams" },
  { labelKey: "roles", code: "Ro", href: "/rollen", area: "roles", requiredLevel: "admin" },
  { labelKey: "files", code: "Dt", href: "/dateien", area: "files" },
  { labelKey: "vacation", code: "Ur", href: "/urlaub", area: "vacation" },
  { labelKey: "sickness", code: "Kr", href: "/krankheit", area: "sickness" },
  { labelKey: "shifts", code: "Sp", href: "/schichtplanung", area: "shifts" },
  {
    labelKey: "timeTracking",
    code: "Ze",
    href: "/zeiterfassung",
    area: "timeTracking",
    requiresTimeTracking: true,
  },
  { labelKey: "reports", code: "Rp", href: "/reports", area: "timeTracking" },
  { labelKey: "reminders", code: "Er", href: "/erinnerungen", area: "reminders" },
];

function getFallbackTenantItem(t: (key: string) => string): TenantItem {
  return {
    name: t("tenant.selectCompany"),
    role: t("tenant.noCompanyActive"),
    mark: "U",
    href: "/select",
    colorClass: "sidebar-tenant-mark-blue",
  };
}

const defaultSettings: NonNullable<TenantItem["settings"]> = {
  companyAddress: null,
  taxId: "",
  defaultLocationId: "",
  weekStart: "monday",
  workHours: "40 Stunden pro Woche",
  vacationDays: 30,
  employeeNumberRequired: true,
  employeeNumberPrefix: "MA-",
  employeeNumberSuffix: "",
  archiveFormerEmployees: true,
  mailNotifications: true,
  inAppNotifications: true,
  mobilePush: false,
  deadlineAlerts: true,
  absenceAlerts: true,
  shiftAlerts: true,
  digestTime: "monday-0800",
  twoFactorRequired: false,
  sessionTimeout: true,
  auditRetentionMonths: 24,
  timeTrackingEnabled: false,
  timeTrackingBreaksEnabled: true,
  timeTrackingAutoBreakDeduction: false,
  timeTrackingClockInMode: "always",
  timeTrackingClockInLeadMinutes: 60,
  timeTrackingReminderPush: true,
  timeTrackingAutoClockOut: false,
  timeTrackingAutoClockOutAfterShiftMinutes: 60,
  timeTrackingAutoClockOutMaxHours: 12,
  timeTrackingQrRequired: false,
};

function tenantSlugFromHref(href: string) {
  return href.split("/").filter(Boolean).at(1) ?? "";
}

function tenantSlugFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return segments[0] === "u" ? segments[1] : undefined;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NavigationFetchedData = {
  tenant: string;
  notifications: NotificationItem[];
  usage: NavigationUsageInfo | null;
};

/** Geteilt zwischen dem Mandanten-Mount-Fetch und dem Öffnen-der-Glocke-Refetch (QA-Bug BUG-019). */
function fetchNavigationNotifications(
  tenant: string,
  onData: (data: NavigationFetchedData) => void,
) {
  fetch(`/api/me/notifications?tenant=${encodeURIComponent(tenant)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then(
      (data: { notifications?: NotificationItem[]; usage?: NavigationUsageInfo | null } | null) => {
        if (data) {
          onData({
            tenant,
            notifications: data.notifications ?? [],
            usage: data.usage ?? null,
          });
        }
      },
    )
    .catch(() => {});
}

const DIGEST_WEEKDAYS = [
  { value: "monday", label: "Montag" },
  { value: "tuesday", label: "Dienstag" },
  { value: "wednesday", label: "Mittwoch" },
  { value: "thursday", label: "Donnerstag" },
  { value: "friday", label: "Freitag" },
  { value: "saturday", label: "Samstag" },
  { value: "sunday", label: "Sonntag" },
];

/** Zerlegt `"monday-0800"` in Wochentag + `"08:00"` fürs Formular — Tag/Uhrzeit sind frei wählbar (siehe lib/notifications/digest-schedule.ts). */
function parseDigestTime(digestTime: string): { weekday: string; timeOfDay: string; enabled: boolean } {
  if (digestTime === "disabled") {
    return { weekday: "monday", timeOfDay: "08:00", enabled: false };
  }

  const [weekday, hhmm] = digestTime.split("-");

  if (!weekday || !hhmm || hhmm.length !== 4) {
    return { weekday: "monday", timeOfDay: "08:00", enabled: true };
  }

  return { weekday, timeOfDay: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, enabled: true };
}

type SettingsCategoryId =
  | "account"
  | "company"
  | "notifications"
  | "timeTracking"
  | "security"
  | "integrations"
  | "billing";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  area?: TenantPermissionArea;
  requiredLevel?: PermissionLevel;
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: string;
};

function getSettingsCategories(t: (key: string) => string): SettingsCategory[] {
  return [
    {
      id: "account",
      label: t("categories.account.label"),
      description: t("categories.account.description"),
      icon: UserCog,
    },
    {
      id: "company",
      label: t("categories.company.label"),
      description: t("categories.company.description"),
      icon: Building2,
      area: "settings",
      requiredLevel: "write",
    },
    {
      id: "notifications",
      label: t("categories.notifications.label"),
      description: t("categories.notifications.description"),
      icon: Bell,
      area: "settings",
      requiredLevel: "write",
    },
    {
      id: "timeTracking",
      label: t("categories.timeTracking.label"),
      description: t("categories.timeTracking.description"),
      icon: Timer,
      area: "settings",
      requiredLevel: "write",
    },
    {
      id: "security",
      label: t("categories.security.label"),
      description: t("categories.security.description"),
      icon: ShieldCheck,
      // Bewusst ohne area/requiredLevel — anders als die übrigen Mandanten-
      // weiten Einstellungen soll dieser Tab für jedes Mitglied sichtbar sein
      // (Transparenz über die eigene Login-Sicherheit). Die einzige darin
      // enthaltene Mandanten-weite Einstellung (Audit-Log-Aufbewahrung) bleibt
      // trotzdem geschützt: das Feld wird unten für Mitglieder ohne
      // "settings:write" deaktiviert, und `updateTenantSecurity` erzwingt den
      // Zugriff serverseitig ohnehin unabhängig von der UI.
    },
    {
      id: "integrations",
      label: t("categories.integrations.label"),
      description: t("categories.integrations.description"),
      icon: Plug,
      area: "settings",
      requiredLevel: "admin",
    },
    {
      id: "billing",
      label: t("categories.billing.label"),
      description: t("categories.billing.description"),
      icon: CreditCard,
      area: "settings",
      requiredLevel: "write",
    },
  ];
}

export type NavigationUserItem = {
  name: string;
  email: string;
  initials: string;
};

export type NavigationUsageInfo = {
  employeeTotal: number;
  activeEmployees: number;
  employeeLimit: number | null;
};

function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-light bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-ink" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * Rechnungshistorie aus Stripe — lädt erst, wenn der Abrechnung-Tab
 * tatsächlich geöffnet wird (dieser Client-Baustein mountet nur dann),
 * statt Stripe bei jedem Seitenaufruf über die Navigation-Sidebar
 * mitanzufragen.
 */
function InvoicesList({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("Navigation.settings.billing");
  const [invoices, setInvoices] = useState<BillingInvoice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/tenants/${tenantSlug}/billing/invoices`)
      .then((response) => {
        if (!response.ok) throw new Error("request failed");
        return response.json();
      })
      .then((data: { invoices: BillingInvoice[] }) => {
        if (!cancelled) setInvoices(data.invoices);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  return (
    <SettingsSection title={t("invoicesTitle")} icon={FileText}>
      {error ? (
        <p className="text-[12.5px] text-danger">{t("invoicesError")}</p>
      ) : invoices === null ? (
        <p className="text-[12.5px] text-muted-2">{t("invoicesLoading")}</p>
      ) : invoices.length === 0 ? (
        <p className="text-[12.5px] text-muted-2">{t("invoicesEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-light bg-bg px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-ink">
                  {invoice.number ?? invoice.id}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-2">
                  {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
                    new Date(invoice.createdAt),
                  )}
                  {" · "}
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: invoice.currency.toUpperCase(),
                  }).format(invoice.amountDue / 100)}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {invoice.hostedInvoiceUrl && (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    {t("invoiceView")}
                  </a>
                )}
                {invoice.invoicePdf && (
                  <a
                    href={invoice.invoicePdf}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <Download size={14} />
                    {t("invoiceDownload")}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

function TenantSlugField({ initialSlug }: { initialSlug: string }) {
  const [value, setValue] = useState(initialSlug);
  const slug = slugify(value);
  const slugState = useSlugAvailability(slug, initialSlug);
  const showStatus = slug !== "" && slug !== initialSlug;
  const t = useTranslations("Navigation.settings.company");

  return (
    <div className="field">
      <label htmlFor="settings-company-id" className="label">
        {t("tenantId")}
      </label>
      <input
        id="settings-company-id"
        name="tenantId"
        className="input input-mono bg-white"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {showStatus && (
        <p
          className={cx(
            "mt-1 flex items-center gap-1.5 text-[12px] font-medium",
            slugState === "checking"
              ? "text-muted-2"
              : slugState === "available"
                ? "text-success"
                : slugState === "taken"
                  ? "text-danger"
                  : "text-muted-2",
          )}
        >
          {slugState === "checking" && (
            <>
              <Loader2 size={12} className="animate-spin" /> {t("checking")}
            </>
          )}
          {slugState === "available" && (
            <>
              <Check size={12} strokeWidth={2.6} /> {t("available")}
            </>
          )}
          {slugState === "taken" && (
            <>
              <X size={12} strokeWidth={2.6} /> {t("taken")}
            </>
          )}
          {slugState === "error" && t("checkFailed")}
        </p>
      )}
    </div>
  );
}

function SettingsPanel({
  activeCategory,
  tenant,
  user,
  usage,
  isStripeConfigured,
}: {
  activeCategory: SettingsCategoryId;
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
  isStripeConfigured: boolean;
}) {
  const settings = tenant.settings ?? defaultSettings;
  const t = useTranslations("Navigation.settings");
  const tAddress = useTranslations("AddressFields");
  const currentLocale = useLocale();
  const [, openBillingPortalFormAction] = useActionStateWithToast(openBillingPortalAction);
  const [, startBillingCheckoutFormAction] = useActionStateWithToast(startBillingCheckoutAction);
  if (activeCategory === "company") {
    return (
      <div className="flex flex-col gap-4">
        <SettingsSection title={t("company.profileTitle")} icon={Building2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-company-name" className="label">
                {t("company.companyName")}
              </label>
              <input
                id="settings-company-name"
                name="companyName"
                className="input bg-white"
                defaultValue={tenant.name}
                required
              />
            </div>
            <TenantSlugField initialSlug={tenant.slug ?? tenantSlugFromHref(tenant.href)} />
            <div className="sm:col-span-2">
              <div className="mb-2 label">{t("company.billingAddress")}</div>
              <AddressFields
                idPrefix="settings-company-address"
                namePrefix="companyAddress"
                defaults={settings.companyAddress}
                t={tAddress}
              />
            </div>
            <div className="field">
              <label htmlFor="settings-company-tax" className="label">
                {t("company.vatId")}
              </label>
              <input
                id="settings-company-tax"
                name="taxId"
                className="input input-mono bg-white"
                defaultValue={settings.taxId}
                maxLength={64}
              />
            </div>
          </div>
        </SettingsSection>
        <SettingsSection title={t("company.defaultsTitle")} icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-default-location" className="label">
                {t("company.defaultLocation")}
              </label>
              <select
                id="settings-default-location"
                name="defaultLocation"
                className="input cursor-pointer bg-white"
                defaultValue={settings.defaultLocationId}
                disabled={!tenant.locations?.length}
              >
                <option value="">
                  {tenant.locations?.length
                    ? t("company.noDefaultLocation")
                    : t("company.noLocationsYet")}
                </option>
                {tenant.locations?.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-week-start" className="label">
                {t("company.weekStart")}
              </label>
              <select
                id="settings-week-start"
                name="weekStart"
                className="input cursor-pointer bg-white"
                defaultValue={settings.weekStart}
              >
                <option value="monday">{t("company.monday")}</option>
                <option value="sunday">{t("company.sunday")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-work-hours" className="label">
                {t("company.workHours")}
              </label>
              <input
                id="settings-work-hours"
                name="workHours"
                className="input bg-white"
                defaultValue={settings.workHours}
              />
            </div>
            <div className="field">
              <label htmlFor="settings-vacation-days" className="label">
                {t("company.vacationDays")}
              </label>
              <input
                id="settings-vacation-days"
                name="vacationDays"
                type="number"
                min="0"
                className="input bg-white"
                defaultValue={settings.vacationDays}
              />
            </div>
          </div>
        </SettingsSection>
        <SettingsSection title={t("company.dataRetentionTitle")} icon={KeyRound}>
          <div className="flex flex-col gap-3">
            <Checkbox id="employeeNumberRequired" defaultChecked={settings.employeeNumberRequired}>
              {t("company.employeeNumberRequired")}
            </Checkbox>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="settings-employee-number-prefix" className="label">
                  {t("company.employeeNumberPrefix")}
                </label>
                <input
                  id="settings-employee-number-prefix"
                  name="employeeNumberPrefix"
                  className="input bg-white"
                  placeholder="MA-"
                  defaultValue={settings.employeeNumberPrefix}
                  maxLength={16}
                />
              </div>
              <div className="field">
                <label htmlFor="settings-employee-number-suffix" className="label">
                  {t("company.employeeNumberSuffix")}
                </label>
                <input
                  id="settings-employee-number-suffix"
                  name="employeeNumberSuffix"
                  className="input bg-white"
                  placeholder={t("company.employeeNumberSuffixPlaceholder")}
                  defaultValue={settings.employeeNumberSuffix}
                  maxLength={16}
                />
              </div>
            </div>
            <Checkbox id="archiveFormerEmployees" defaultChecked={settings.archiveFormerEmployees}>
              {t("company.archiveFormerEmployees")}
            </Checkbox>
            <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
              <p className="text-[12px] text-muted">
                {t("company.exportDescription")}
              </p>
              <a
                href={`/api/tenants/${tenant.slug ?? tenantSlugFromHref(tenant.href)}/export`}
                className="btn btn-secondary btn-sm shrink-0"
              >
                {t("company.exportButton")}
              </a>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
              <p className="text-[12px] text-muted">
                {t("company.processingRegisterDescription")}
              </p>
              <a
                href={`/u/${tenant.slug ?? tenantSlugFromHref(tenant.href)}/verarbeitungsverzeichnis`}
                className="btn btn-secondary btn-sm shrink-0"
              >
                <FileText className="size-4" />
                {t("company.processingRegisterButton")}
              </a>
            </div>
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (activeCategory === "notifications") {
    return (
      <SettingsSection title={t("notificationsTab.title")} icon={Bell}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              {t("notificationsTab.channelsTitle")}
            </div>
            <Checkbox id="mailNotifications" defaultChecked={settings.mailNotifications}>
              {t("notificationsTab.mailNotifications")}
            </Checkbox>
            <Checkbox id="inAppNotifications" defaultChecked={settings.inAppNotifications}>
              {t("notificationsTab.inAppNotifications")}
            </Checkbox>
            <Checkbox id="mobilePush" defaultChecked={settings.mobilePush}>
              {t("notificationsTab.mobilePush")}
            </Checkbox>
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              {t("notificationsTab.eventsTitle")}
            </div>
            <Checkbox id="deadlineAlerts" defaultChecked={settings.deadlineAlerts}>
              {t("notificationsTab.deadlineAlerts")}
            </Checkbox>
            <Checkbox id="absenceAlerts" defaultChecked={settings.absenceAlerts}>
              {t("notificationsTab.absenceAlerts")}
            </Checkbox>
            <Checkbox id="shiftAlerts" defaultChecked={settings.shiftAlerts}>
              {t("notificationsTab.shiftAlerts")}
            </Checkbox>
          </div>
          <div className="field sm:col-span-2">
            <div className="label">{t("notificationsTab.digestLabel")}</div>
            <Checkbox id="digestEnabled" defaultChecked={parseDigestTime(settings.digestTime).enabled}>
              {t("notificationsTab.digestEnabled")}
            </Checkbox>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="settings-digest-weekday" className="label">
                  {t("notificationsTab.digestWeekdayLabel")}
                </label>
                <select
                  id="settings-digest-weekday"
                  name="digestWeekday"
                  className="input cursor-pointer bg-white"
                  defaultValue={parseDigestTime(settings.digestTime).weekday}
                >
                  {DIGEST_WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="settings-digest-time-of-day" className="label">
                  {t("notificationsTab.digestTimeLabel")}
                </label>
                <input
                  id="settings-digest-time-of-day"
                  name="digestTimeOfDay"
                  type="time"
                  className="input bg-white"
                  defaultValue={parseDigestTime(settings.digestTime).timeOfDay}
                />
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    );
  }

  if (activeCategory === "timeTracking") {
    return (
      <div className="flex flex-col gap-4">
        <SettingsSection title={t("timeTrackingTab.title")} icon={Timer}>
          <div className="flex flex-col gap-3">
            <Checkbox id="timeTrackingEnabled" defaultChecked={settings.timeTrackingEnabled}>
              {t("timeTrackingTab.enabled")}
            </Checkbox>
            <p className="text-[12px] text-muted">{t("timeTrackingTab.enabledHint")}</p>
            <p className="text-[12px] text-muted">{t("timeTrackingTab.worksCouncilHint")}</p>
          </div>
        </SettingsSection>

        <SettingsSection title={t("timeTrackingTab.clockInTitle")} icon={Timer}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-clock-in-mode" className="label">
                {t("timeTrackingTab.clockInMode")}
              </label>
              <select
                id="settings-clock-in-mode"
                name="timeTrackingClockInMode"
                className="input cursor-pointer bg-white"
                defaultValue={settings.timeTrackingClockInMode}
              >
                <option value="always">{t("timeTrackingTab.clockInModeAlways")}</option>
                <option value="shift">{t("timeTrackingTab.clockInModeShift")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-clock-in-lead" className="label">
                {t("timeTrackingTab.clockInLead")}
              </label>
              <input
                id="settings-clock-in-lead"
                name="timeTrackingClockInLeadMinutes"
                type="number"
                min={0}
                max={240}
                className="input bg-white"
                defaultValue={settings.timeTrackingClockInLeadMinutes}
              />
            </div>
            <p className="text-[12px] text-muted sm:col-span-2">{t("timeTrackingTab.clockInHint")}</p>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Checkbox id="timeTrackingQrRequired" defaultChecked={settings.timeTrackingQrRequired}>
                {t("timeTrackingTab.qrRequired")}
              </Checkbox>
              <p className="text-[12px] text-muted">{t("timeTrackingTab.qrRequiredHint")}</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t("timeTrackingTab.breaksTitle")} icon={Timer}>
          <div className="flex flex-col gap-3">
            <Checkbox id="timeTrackingBreaksEnabled" defaultChecked={settings.timeTrackingBreaksEnabled}>
              {t("timeTrackingTab.breaksEnabled")}
            </Checkbox>
            <Checkbox
              id="timeTrackingAutoBreakDeduction"
              defaultChecked={settings.timeTrackingAutoBreakDeduction}
            >
              {t("timeTrackingTab.autoBreakDeduction")}
            </Checkbox>
            <p className="text-[12px] text-muted">{t("timeTrackingTab.autoBreakDeductionHint")}</p>
          </div>
        </SettingsSection>

        <SettingsSection title={t("timeTrackingTab.autoClockOutTitle")} icon={Timer}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Checkbox id="timeTrackingAutoClockOut" defaultChecked={settings.timeTrackingAutoClockOut}>
                {t("timeTrackingTab.autoClockOut")}
              </Checkbox>
            </div>
            <div className="field">
              <label htmlFor="settings-auto-clock-out-after-shift" className="label">
                {t("timeTrackingTab.autoClockOutAfterShift")}
              </label>
              <input
                id="settings-auto-clock-out-after-shift"
                name="timeTrackingAutoClockOutAfterShiftMinutes"
                type="number"
                min={0}
                max={720}
                className="input bg-white"
                defaultValue={settings.timeTrackingAutoClockOutAfterShiftMinutes}
              />
            </div>
            <div className="field">
              <label htmlFor="settings-auto-clock-out-max-hours" className="label">
                {t("timeTrackingTab.autoClockOutMaxHours")}
              </label>
              <input
                id="settings-auto-clock-out-max-hours"
                name="timeTrackingAutoClockOutMaxHours"
                type="number"
                min={1}
                max={24}
                className="input bg-white"
                defaultValue={settings.timeTrackingAutoClockOutMaxHours}
              />
            </div>
            <p className="text-[12px] text-muted sm:col-span-2">{t("timeTrackingTab.autoClockOutHint")}</p>
          </div>
        </SettingsSection>

        <SettingsSection title={t("timeTrackingTab.pushTitle")} icon={Bell}>
          <div className="flex flex-col gap-3">
            <Checkbox id="timeTrackingReminderPush" defaultChecked={settings.timeTrackingReminderPush}>
              {t("timeTrackingTab.reminderPush")}
            </Checkbox>
            <p className="text-[12px] text-muted">
              {settings.mobilePush
                ? t("timeTrackingTab.reminderPushHint")
                : t("timeTrackingTab.reminderPushNeedsMobilePush")}
            </p>
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (activeCategory === "security") {
    const canManageSecurity = hasRequiredLevel(
      tenant.permissions?.settings ?? "none",
      "write",
    );

    return (
      <div className="flex flex-col gap-4">
        <SettingsSection title={t("security.loginTitle")} icon={ShieldCheck}>
          <fieldset disabled={!canManageSecurity} className="m-0 border-0 p-0">
            <Checkbox
              id="twoFactorRequired"
              defaultChecked={settings.twoFactorRequired}
              alignItems="start"
            >
              <span className="block">{t("security.twoFactorRequired")}</span>
              <span className="mt-0.5 block text-[11.5px] font-normal text-muted-2">
                {t("security.twoFactorRequiredHint")}
              </span>
            </Checkbox>
          </fieldset>
          {!canManageSecurity && (
            <p className="mt-1 text-[11.5px] text-muted-2">
              {t("security.writeRequired")}
            </p>
          )}
        </SettingsSection>
        <div className="grid gap-3">
          <div className="field">
            <label htmlFor="settings-audit-retention" className="label">
              {t("security.auditRetention")}
            </label>
            <select
              id="settings-audit-retention"
              name="auditRetentionMonths"
              className="input cursor-pointer bg-white disabled:cursor-not-allowed disabled:opacity-60"
              defaultValue={settings.auditRetentionMonths}
              disabled={!canManageSecurity}
            >
              <option value="12">{t("security.months12")}</option>
              <option value="24">{t("security.months24")}</option>
              <option value="60">{t("security.years5")}</option>
            </select>
            {!canManageSecurity && (
              <p className="mt-1 text-[11.5px] text-muted-2">
                {t("security.writeRequired")}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeCategory === "integrations") {
    return (
      <SettingsSection title={t("integrations.title")} icon={Plug}>
        <p className="text-[12.5px] leading-5 text-muted">
          {t("integrations.description")}
        </p>
        <div className="mt-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5">
          <div className="text-[13px] font-semibold text-ink">
            {t("integrations.documentsTitle")}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-2">
            {t("integrations.documentsDescription")}
          </div>
        </div>
      </SettingsSection>
    );
  }

  if (activeCategory === "billing") {
    const isSubscriptionHealthy =
      tenant.stripeSubscriptionStatus === "active" ||
      tenant.stripeSubscriptionStatus === "trialing";
    const periodEndLabel = tenant.stripeCurrentPeriodEnd
      ? new Intl.DateTimeFormat(currentLocale === "en" ? "en-GB" : "de-DE", {
          dateStyle: "medium",
        }).format(new Date(tenant.stripeCurrentPeriodEnd))
      : null;

    return (
      <div className="flex flex-col gap-4">
        <input type="hidden" name="companyName" value={tenant.name} />
        <input
          type="hidden"
          name="tenantId"
          value={tenant.slug ?? tenantSlugFromHref(tenant.href)}
        />

        {!isStripeConfigured ? (
          <SettingsSection title={t("billing.subscriptionTitle")} icon={CreditCard}>
            <div className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-5 text-[#7A4E00]">
              {t("billing.notConfigured")}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="settings-plan" className="label">
                  {t("billing.plan")}
                </label>
                <select
                  id="settings-plan"
                  name="planSelection"
                  className="input cursor-pointer bg-white"
                  defaultValue={tenant.plan ?? "professional"}
                >
                  <option value="starter">{t("billing.starter")}</option>
                  <option value="professional">{t("billing.professional")}</option>
                  <option value="business">{t("billing.business")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="settings-payment-interval" className="label">
                  {t("billing.billingInterval")}
                </label>
                <select
                  id="settings-payment-interval"
                  name="paymentInterval"
                  className="input cursor-pointer bg-white"
                  defaultValue={tenant.billingCycle ?? "monthly"}
                >
                  <option value="monthly">{t("billing.monthly")}</option>
                  <option value="yearly">{t("billing.yearly")}</option>
                </select>
              </div>
              <div className="field sm:col-span-2">
                <label htmlFor="settings-receipt-email" className="label">
                  {t("billing.receiptEmail")}
                </label>
                <input
                  id="settings-receipt-email"
                  name="receiptEmail"
                  type="email"
                  className="input bg-white"
                  defaultValue={tenant.contactEmail ?? ""}
                />
              </div>
            </div>
          </SettingsSection>
        ) : isSubscriptionHealthy ? (
          <SettingsSection title={t("billing.subscriptionTitle")} icon={CreditCard}>
            <div className="rounded-[10px] border border-success/30 bg-success/10 px-3 py-2.5 text-[12.5px] leading-5 text-[#1F5D2C]">
              {t("billing.activePlan")} <strong className="capitalize">{tenant.plan}</strong>
              {" "}
              (
              {tenant.billingCycle === "yearly"
                ? t("billing.yearlySuffix")
                : t("billing.monthlySuffix")}
              ).{" "}
              {periodEndLabel
                ? tenant.stripeCancelAtPeriodEnd
                  ? t("billing.endsOn", { date: periodEndLabel })
                  : t("billing.renewsOn", { date: periodEndLabel })
                : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                formAction={openBillingPortalFormAction}
                name="portalIntent"
                value="switch-plan"
                className="btn btn-secondary btn-sm"
              >
                {t("billing.changePlan")}
              </button>
              <button
                type="submit"
                formAction={openBillingPortalFormAction}
                className="btn btn-secondary btn-sm"
              >
                {t("billing.managePayment")}
              </button>
            </div>
          </SettingsSection>
        ) : (
          <SettingsSection title={t("billing.subscriptionTitle")} icon={CreditCard}>
            <div className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-5 text-[#7A4E00]">
              {t("billing.noActiveSubscription")}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="settings-plan" className="label">
                  {t("billing.plan")}
                </label>
                <select
                  id="settings-plan"
                  name="planSelection"
                  className="input cursor-pointer bg-white"
                  defaultValue={tenant.plan ?? "professional"}
                >
                  <option value="starter">{t("billing.starter")}</option>
                  <option value="professional">{t("billing.professional")}</option>
                  <option value="business">{t("billing.business")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="settings-payment-interval" className="label">
                  {t("billing.billingInterval")}
                </label>
                <select
                  id="settings-payment-interval"
                  name="paymentInterval"
                  className="input cursor-pointer bg-white"
                  defaultValue={tenant.billingCycle ?? "monthly"}
                >
                  <option value="monthly">{t("billing.monthly")}</option>
                  <option value="yearly">{t("billing.yearly")}</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              formAction={startBillingCheckoutFormAction}
              className="btn btn-primary btn-sm mt-3"
            >
              {t("billing.subscribeNow")}
            </button>
          </SettingsSection>
        )}

        <SettingsSection title={t("billing.usageTitle")} icon={Building2}>
          <div className="rounded-[10px] border border-border-light bg-bg px-3 py-2.5">
            <div className="text-[13px] font-semibold text-ink">
              {usage
                ? `${usage.activeEmployees}${usage.employeeLimit ? ` / ${usage.employeeLimit}` : ""} ${t("billing.activeEmployees")}`
                : t("billing.noUsageData")}
            </div>
            {usage && (
              <div className="mt-0.5 text-[11.5px] text-muted-2">
                {usage.employeeTotal} {t("billing.totalRecords")}
              </div>
            )}
          </div>
        </SettingsSection>

        {isStripeConfigured && (
          <InvoicesList tenantSlug={tenant.slug ?? tenantSlugFromHref(tenant.href)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title={t("account.profileTitle")} icon={UserCog}>
        <div className="mb-4 flex items-center gap-3 rounded-[10px] bg-bg p-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white">
            {user?.initials ?? "–"}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink">{user?.name ?? t("account.signedIn")}</div>
            <div className="mt-0.5 text-[12px] text-muted-2">
              {t("account.roleAt", { role: tenant.role, company: tenant.name })}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="settings-account-name" className="label">
              {t("account.displayName")}
            </label>
            <input
              id="settings-account-name"
              name="accountName"
              className="input bg-white"
              defaultValue={user?.name ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-account-email" className="label">
              {t("account.email")}
            </label>
            <input
              id="settings-account-email"
              className="input bg-bg"
              defaultValue={user?.email ?? ""}
              readOnly
              aria-describedby="settings-account-email-hint"
            />
            <p id="settings-account-email-hint" className="mt-1 text-[11.5px] text-muted">
              {t("account.emailHint")}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("account.passwordTitle")} icon={KeyRound}>
        <p className="text-[12.5px] leading-5 text-muted">
          {t("account.passwordDescription")}
        </p>
        <Link href="/konto" className="btn btn-secondary btn-sm mt-3 w-fit">
          <UserCog size={14} />
          {t("account.manageAccount")}
        </Link>
      </SettingsSection>
    </div>
  );
}

function SettingsPopupForm({
  tenant,
  user,
  usage,
  isStripeConfigured,
  onDone,
}: {
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
  isStripeConfigured: boolean;
  onDone: () => void;
}) {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("account");
  const t = useTranslations("Navigation.settings");

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveSettingsPopupAction,
    {},
  );
  // Zeigt eine "Gespeichert"-Bestätigung statt das Popup zu schließen — ein
  // Redirect nach dem Speichern würde die aktuelle Seite dahinter wechseln
  // und wirkte wie ein ungewolltes Schließen (siehe To-Do "Unternehmen →
  // Speichern → Bestätigung anzeigen, Fenster dabei nicht schließen").
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      setJustSaved(true);
      toast({ tone: "success", title: "Gespeichert" });
    }
    wasPending.current = isPending;
  }, [isPending, state, toast]);

  useEffect(() => {
    if (!justSaved) return;
    const timeout = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  const visibleCategories = getSettingsCategories(t).filter((category) => {
    if (!category.area || !tenant.permissions) {
      return true;
    }

    return hasRequiredLevel(
      tenant.permissions[category.area],
      category.requiredLevel ?? "read",
    );
  });

  const activeCategoryLabel =
    visibleCategories.find((category) => category.id === activeCategory)?.label ??
    t("categories.account.label");

  return (
    <form
      action={formAction}
      className="grid h-full min-h-0 bg-white md:grid-cols-[260px_1fr] md:grid-rows-[1fr_auto]"
    >
      <input type="hidden" name="tenant" value={tenant.slug ?? tenantSlugFromHref(tenant.href)} />
      <input type="hidden" name="category" value={activeCategory} />
      <input type="hidden" name="country" value={tenant.country ?? "DE"} />
      <input type="hidden" name="timezone" value={tenant.timezone ?? "Europe/Berlin"} />
      <input type="hidden" name="size" value={tenant.size ?? ""} />
      <input type="hidden" name="industry" value={tenant.industry ?? ""} />
      <input type="hidden" name="contactEmail" value={tenant.contactEmail ?? ""} />
      <input type="hidden" name="logoUrl" value={tenant.logoUrl ?? ""} />
      <input type="hidden" name="primaryColor" value={tenant.primaryColor ?? "#2A6FDB"} />
      <input type="hidden" name="plan" value={tenant.plan ?? "professional"} />
      <input type="hidden" name="billingCycle" value={tenant.billingCycle ?? "monthly"} />
      <nav
        aria-label={t("categoriesNavLabel")}
        className="border-b border-white/[0.08] bg-[#0D0D0D] p-3 md:row-span-2 md:border-r md:border-b-0"
      >
        <div className="mb-3 px-2 pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5E5E5B]">
          {t("sidebarTitle")}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {visibleCategories.map((category) => {
            const Icon = category.icon;
            const isActive = category.id === activeCategory;

            return (
              <button
                key={category.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "flex min-w-[190px] cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-colors md:min-w-0",
                  isActive
                    ? "bg-white/[0.1] text-white"
                    : "text-[#B0B0AB] hover:bg-white/[0.05] hover:text-white",
                )}
                onClick={() => setActiveCategory(category.id)}
              >
                <span
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-[9px] border",
                    isActive
                      ? "border-white/20 bg-white/[0.14] text-white"
                      : "border-white/10 bg-white/[0.03] text-[#7E7E7B]",
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">
                    {category.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#7E7E7B]">
                    {category.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col overflow-hidden bg-[#FAFAF8]">
        <div className="border-b border-border px-6 py-5">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {t("sectionEyebrow")}
          </div>
          <div className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
            {activeCategoryLabel}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <SettingsPanel
            activeCategory={activeCategory}
            tenant={tenant}
            user={user}
            usage={usage}
            isStripeConfigured={isStripeConfigured}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t border-border-soft bg-white px-6 py-4">
        {state.error ? (
          <span className="mr-auto text-[12.5px] text-danger">{state.error}</span>
        ) : justSaved ? (
          <span className="mr-auto flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
            <Check size={14} strokeWidth={2.5} />
            Gespeichert
          </span>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={Save}
          pendingLabel={t("saving")}
        >
          {t("save")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

function SettingsPopup({
  tenant,
  user,
  usage,
  isStripeConfigured,
  onClose,
}: {
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
  isStripeConfigured: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Navigation.settings");

  // Portal auf document.body: die `<aside>`-Sidebar setzt `md:translate-x-0`
  // (Transform), wodurch sie zum Containing Block für `position: fixed`
  // wird — ohne Portal öffnet sich dieses Overlay dadurch nur innerhalb der
  // Sidebar-Box statt zentriert über der ganzen Seite.
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 backdrop-blur-[6px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogLabel")}
        className="relative h-[min(760px,100svh)] w-full max-w-[1040px] overflow-hidden rounded-card bg-white shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
      >
        <button
          type="button"
          aria-label={t("closeLabel")}
          title={t("close")}
          className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          onClick={onClose}
        >
          <X size={15} strokeWidth={2} />
        </button>

        <SettingsPopupForm
          tenant={tenant}
          user={user}
          usage={usage}
          isStripeConfigured={isStripeConfigured}
          onDone={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

function NotificationsPopup({
  notifications,
  readNotificationIds,
  onClose,
  onMarkAsRead,
}: {
  notifications: NotificationItem[];
  readNotificationIds: string[];
  onClose: () => void;
  onMarkAsRead: (ids: string[]) => void;
}) {
  const unreadNotifications = notifications.filter(
    (notification) => !readNotificationIds.includes(notification.id),
  );
  const hasUnread = unreadNotifications.length > 0;
  const t = useTranslations("Navigation.notificationsPopup");

  return (
    <div
      className="sidebar-notification-popover"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-label={t("title")}
        className="relative flex max-h-[calc(100svh-32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-card bg-white shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:max-h-[620px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {t("inboxEyebrow")}
            </div>
            <div className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
              {t("title")}
            </div>
          </div>

          <button
            type="button"
            aria-label={t("closeLabel")}
            title={t("close")}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            onClick={onClose}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border-soft bg-bg px-5 py-3">
          <div className="text-[12.5px] text-muted-2">
            {hasUnread
              ? t("unreadCount", { count: unreadNotifications.length })
              : t("allRead")}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm px-3"
            disabled={!hasUnread}
            onClick={() =>
              onMarkAsRead(unreadNotifications.map((notification) => notification.id))
            }
          >
            <Check size={14} />
            {t("markAllRead")}
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {notifications.length === 0 && (
              <p className="rounded-[12px] border border-border-soft bg-white p-3 text-[12.5px] text-muted">
                {t("empty")}
              </p>
            )}
            {notifications.map((notification) => {
              const isRead = readNotificationIds.includes(notification.id);

              return (
                <article
                  key={notification.id}
                  className={cx(
                    "flex items-start gap-2 rounded-[12px] border p-3 transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:bg-white hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
                    isRead
                      ? "border-border-soft bg-white"
                      : "border-ink/10 bg-[#F6F4EF]",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[9px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/20"
                    onClick={() => {
                      onMarkAsRead([notification.id]);
                      onClose();
                    }}
                  >
                    <span
                      className={cx(
                        "mt-1 size-2 shrink-0 rounded-full",
                        isRead ? "bg-border-light" : "bg-warning",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-[13.5px] font-semibold text-ink">
                          {notification.title}
                        </h3>
                        <span className="rounded-chip bg-white px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                          {notification.category}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-5 text-muted-2">
                        {notification.detail}
                      </p>
                      <div className="mt-2">
                        <span className="font-mono text-[10px] text-muted">
                          {notification.time}
                        </span>
                      </div>
                    </div>
                  </button>

                  {!isRead && (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] font-semibold text-ink transition-colors hover:text-muted-2"
                      onClick={() => onMarkAsRead([notification.id])}
                    >
                      {t("markRead")}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NavigationSidebar({
  tenants = [],
  user,
  isStripeConfigured = false,
}: {
  tenants?: NavigationTenantItem[];
  user?: NavigationUserItem;
  isStripeConfigured?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const currentLocale = useLocale();
  const t = useTranslations("Navigation");
  const [, switchLanguageFormAction] = useActionStateWithToast(switchLanguageAction);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  // Antwort inkl. Mandant, damit beim Mandantenwechsel nicht kurz die Daten
  // des vorherigen Mandanten stehen bleiben.
  const [fetchedData, setFetchedData] = useState<NavigationFetchedData | null>(null);
  const tenantSelectorRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useParams<{ tenant?: string | string[] }>();

  const routeTenant = Array.isArray(params.tenant) ? params.tenant[0] : params.tenant;
  const tenant = routeTenant ?? tenantSlugFromPathname(pathname);
  const baseHref = tenant ? `/u/${tenant}` : "/u";
  const fallbackTenantItem = getFallbackTenantItem(t);
  const tenantItems = tenants.length > 0 ? tenants : [fallbackTenantItem];
  const isCurrentTenantData = Boolean(tenant) && fetchedData?.tenant === tenant;
  const notifications = isCurrentTenantData ? fetchedData!.notifications : [];
  const usage = isCurrentTenantData ? fetchedData!.usage : null;
  const toggleLabel = isCollapsed ? t("toggle.expand") : t("toggle.collapse");
  const unreadNotificationCount = notifications.filter(
    (notification) => !readNotificationIds.includes(notification.id),
  ).length;
  const activeTenant =
    tenantItems.find((item) => item.href === baseHref) ??
    (tenant
      ? {
          ...fallbackTenantItem,
          name: tenant,
          role: t("tenant.unknownCompany"),
          mark: tenant.slice(0, 1).toUpperCase(),
          href: baseHref,
        }
      : tenantItems[0]);

  const items = useMemo(
    () =>
      navigationItems
        .filter((item) => {
          if (item.requiresTimeTracking && !activeTenant.settings?.timeTrackingEnabled) {
            return false;
          }

          if (!item.area || !activeTenant.permissions) {
            return true;
          }

          return hasRequiredLevel(
            activeTenant.permissions[item.area],
            item.requiredLevel ?? "read",
          );
        })
        .map((item) => {
          const href = `${baseHref}${item.href}`;

          return {
            ...item,
            label: t(`items.${item.labelKey}`),
            href,
            isActive:
              item.href === ""
                ? pathname === baseHref
                : pathname === href || pathname.startsWith(`${href}/`),
          };
        }),
    [activeTenant.permissions, activeTenant.settings?.timeTrackingEnabled, baseHref, pathname, t],
  );

  useEffect(() => {
    if (!tenant) {
      return;
    }

    let cancelled = false;
    fetchNavigationNotifications(tenant, (data) => {
      if (!cancelled) {
        setFetchedData(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  // Zusätzlich beim Öffnen der Glocke neu laden (QA-Bug BUG-019 — Badge und
  // Liste teilten sich zwar schon dieselbe Datenquelle, die aber nur einmal
  // pro Tenant-Wechsel geholt wurde: eine seither entstandene/entfernte
  // Benachrichtigung konnte den Badge-Stand veralten lassen, bis der nächste
  // Tenant-Wechsel neu lädt). Frisch laden, sobald tatsächlich hingesehen wird.
  useEffect(() => {
    if (!isNotificationsOpen || !tenant) {
      return;
    }

    let cancelled = false;
    fetchNavigationNotifications(tenant, (data) => {
      if (!cancelled) {
        setFetchedData(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isNotificationsOpen, tenant]);

  useEffect(() => {
    if (!isTenantMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        tenantSelectorRef.current &&
        !tenantSelectorRef.current.contains(event.target as Node)
      ) {
        setIsTenantMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isTenantMenuOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isNotificationsOpen]);

  return (
    <>
      <button
        type="button"
        className="fixed top-3 left-3 z-[960] flex size-10 items-center justify-center rounded-[10px] border border-border bg-white text-ink shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:hidden"
        aria-label={t("toggle.mobileOpen")}
        aria-expanded={isMobileOpen}
        onClick={() => setIsMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[940] bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cx(
          "sidebar",
          isCollapsed && "sidebar-collapsed",
          "fixed inset-y-0 left-0 z-[950] w-[236px] -translate-x-full transition-transform duration-200 ease-out",
          isMobileOpen && "translate-x-0",
          "md:static md:z-auto md:w-auto md:translate-x-0 md:transition-none",
        )}
      >
      <div className="sidebar-header">
        {!isCollapsed && (
          <Link href={baseHref} className="sidebar-brand" title="Ployo">
            <Image
              src="/logo_square_white.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
              className="sidebar-logo"
            />

            <span className="sidebar-brand-copy">
              <span className="sidebar-brand-title">Ployo</span>
              <span className="sidebar-brand-subtitle">{t("brand.subtitle")}</span>
            </span>
          </Link>
        )}

        <button
          type="button"
          className="sidebar-toggle hidden md:flex"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!isCollapsed}
          onClick={() => {
            setIsTenantMenuOpen(false);
            setIsCollapsed((current) => !current);
          }}
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        <button
          type="button"
          className="sidebar-toggle md:hidden"
          title={t("toggle.mobileClose")}
          aria-label={t("toggle.mobileClose")}
          onClick={() => setIsMobileOpen(false)}
        >
          <X size={15} />
        </button>
      </div>

      <nav
        className="sidebar-nav"
        aria-label={t("mainNavLabel")}
        onClick={() => setIsMobileOpen(false)}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={item.isActive ? "page" : undefined}
            className={cx("sidebar-link", item.isActive && "sidebar-link-active")}
          >
            <span
              className={cx(
                "sidebar-link-code",
                item.isActive && "sidebar-link-code-active",
              )}
            >
              {item.code}
            </span>

            {!isCollapsed && (
              <span className="sidebar-link-label">{item.label}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-tenant" ref={tenantSelectorRef}>
          {!isCollapsed && isTenantMenuOpen && (
            <div className="sidebar-tenant-menu">
              <div className="sidebar-tenant-menu-header">
                <div className="sidebar-tenant-menu-title">
                  {t("tenant.switchTenant")}
                </div>
              </div>

              {tenantItems.map((item) => {
                const isActive = item.href === activeTenant.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "sidebar-tenant-option",
                      isActive && "sidebar-tenant-option-active",
                    )}
                    onClick={() => setIsTenantMenuOpen(false)}
                  >
                    <span
                      className={cx("sidebar-tenant-mark", item.colorClass)}
                    >
                      {item.mark}
                    </span>
                    <span className="sidebar-tenant-option-copy">
                      <span className="sidebar-tenant-option-name">
                        {item.name}
                      </span>
                      <span className="sidebar-tenant-option-role">
                        {item.role}
                      </span>
                    </span>
                    {isActive && (
                      <Check size={12} className="sidebar-tenant-check" />
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          <button
            type="button"
            title={activeTenant.name}
            className="sidebar-link sidebar-tenant-trigger"
            aria-haspopup="menu"
            aria-expanded={isTenantMenuOpen}
            onClick={() => {
              if (!isCollapsed) {
                setIsTenantMenuOpen((current) => !current);
              }
            }}
          >
            <span
              className={cx("sidebar-tenant-mark", activeTenant.colorClass)}
            >
              {activeTenant.mark}
            </span>

            {!isCollapsed && (
              <>
                <span className="sidebar-tenant-name">{activeTenant.name}</span>
                <ChevronsUpDown size={12} className="sidebar-tenant-icon" />
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          title={t("footer.settings")}
          className="sidebar-link w-full appearance-none border-0 bg-transparent text-left"
          aria-haspopup="dialog"
          onClick={() => {
            setIsTenantMenuOpen(false);
            setIsSettingsOpen(true);
          }}
        >
          <span className="sidebar-link-code">Eg</span>
          {!isCollapsed && <span className="sidebar-link-label">{t("footer.settings")}</span>}
        </button>

        <form action="/logout" method="post">
          <button
            type="submit"
            title={t("footer.logout")}
            className="sidebar-link w-full appearance-none border-0 bg-transparent text-left"
          >
            <span className="sidebar-link-code">
              <LogOut size={14} strokeWidth={2} />
            </span>
            {!isCollapsed && <span className="sidebar-link-label">{t("footer.logout")}</span>}
          </button>
        </form>

        {!isCollapsed && (
          <div className="flex items-center gap-1 px-1 py-1">
            {availableLocales.map((locale) => (
              <form key={locale.code} action={switchLanguageFormAction}>
                <input type="hidden" name="redirectTo" value={pathname} />
                <input type="hidden" name="language" value={locale.code} />
                <button
                  type="submit"
                  disabled={currentLocale === locale.code}
                  title={locale.code === "de" ? t("footer.localeDe") : t("footer.localeEn")}
                  className={cx(
                    "cursor-pointer rounded-[7px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors disabled:cursor-default",
                    currentLocale === locale.code
                      ? "bg-white/10 text-white"
                      : "text-muted-2 hover:text-white",
                  )}
                >
                  {locale.label}
                </button>
              </form>
            ))}
          </div>
        )}

        <div className="sidebar-user-row">
          <div className="sidebar-user">
            <div
              className="sidebar-user-avatar"
              title={user ? `${user.name} - ${activeTenant.role}` : undefined}
            >
              {user?.initials ?? "–"}
            </div>

            {!isCollapsed && (
              <div className="sidebar-user-copy">
                <div className="sidebar-user-name">{user?.name ?? t("user.signedIn")}</div>
                <div className="sidebar-user-role">{activeTenant.role}</div>
              </div>
            )}
          </div>

          <div className="sidebar-notification" ref={notificationRef}>
            <button
              type="button"
              className="sidebar-notification-button"
              title={t("user.notifications")}
              aria-label={
                unreadNotificationCount > 0
                  ? t("user.unreadNotifications", { count: unreadNotificationCount })
                  : t("user.notifications")
              }
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              onClick={() => {
                setIsTenantMenuOpen(false);
                setIsNotificationsOpen((current) => !current);
              }}
            >
              <Bell size={16} />
              {unreadNotificationCount > 0 && (
                <span className="sidebar-notification-badge">
                  {unreadNotificationCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <NotificationsPopup
                notifications={notifications}
                readNotificationIds={readNotificationIds}
                onClose={() => setIsNotificationsOpen(false)}
                onMarkAsRead={(ids) => {
                  setReadNotificationIds((current) =>
                    Array.from(new Set([...current, ...ids])),
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsPopup
          tenant={activeTenant}
          user={user}
          usage={usage}
          isStripeConfigured={isStripeConfigured}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      </aside>
    </>
  );
}
