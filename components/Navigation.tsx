"use client";

import { saveSettingsPopupAction } from "@/app/(dashboard)/u/[tenant]/einstellungen/actions";
import AddressFields from "@/components/AddressFields";
import type { AddressInput } from "@/lib/address";
import FormSubmitButton from "@/components/FormSubmitButton";
import {
  Bell,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  KeyRound,
  LogOut,
  Plug,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type NavItem = {
  label: string;
  code: string;
  href: string;
};

type TenantItem = {
  name: string;
  role: string;
  mark: string;
  href: string;
  colorClass: string;
  slug?: string;
  country?: string;
  timezone?: string;
  size?: string;
  industry?: string;
  contactEmail?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  billingCycle?: string;
  settings?: {
    companyAddress: AddressInput | null;
    taxId: string;
    defaultLocationId: string;
    weekStart: string;
    workHours: string;
    vacationDays: number;
    employeeNumberRequired: boolean;
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
  };
};

export type NavigationTenantItem = TenantItem;

const navigationItems: NavItem[] = [
  { label: "Übersicht", code: "Üb", href: "" },
  { label: "Mitarbeiter", code: "MA", href: "/employees" },
  { label: "Standorte", code: "St", href: "/standorte" },
  { label: "Teams", code: "Tm", href: "/teams" },
  { label: "Rollen", code: "Ro", href: "/rollen" },
  { label: "Dateien", code: "Dt", href: "/dateien" },
  { label: "Urlaub", code: "Ur", href: "/urlaub" },
  { label: "Krankheit", code: "Kr", href: "/krankheit" },
  { label: "Schichtplanung", code: "Sp", href: "/schichtplanung" },
  { label: "Erinnerungen", code: "Er", href: "/erinnerungen" },
];

const fallbackTenantItem: TenantItem = {
  name: "Unternehmen auswählen",
  role: "Kein Unternehmen aktiv",
  mark: "U",
  href: "/select",
  colorClass: "sidebar-tenant-mark-blue",
};

const defaultSettings: NonNullable<TenantItem["settings"]> = {
  companyAddress: null,
  taxId: "",
  defaultLocationId: "",
  weekStart: "monday",
  workHours: "40 Stunden pro Woche",
  vacationDays: 30,
  employeeNumberRequired: true,
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

type SettingsCategoryId =
  | "account"
  | "company"
  | "roles"
  | "notifications"
  | "security"
  | "integrations"
  | "billing";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: string;
};

const settingsCategories: SettingsCategory[] = [
  {
    id: "account",
    label: "Konto",
    description: "Profil, Sprache, Darstellung",
    icon: UserCog,
  },
  {
    id: "company",
    label: "Unternehmen",
    description: "Mandant, Standorte, Defaults",
    icon: Building2,
  },
  {
    id: "roles",
    label: "Rollen",
    description: "Zugriffe und Freigaben",
    icon: UsersRound,
  },
  {
    id: "notifications",
    label: "Benachrichtigungen",
    description: "E-Mail und Erinnerungen",
    icon: Bell,
  },
  {
    id: "security",
    label: "Sicherheit",
    description: "Login, 2FA, Sitzungen",
    icon: ShieldCheck,
  },
  {
    id: "integrations",
    label: "Integrationen",
    description: "Lohn, Kalender, API",
    icon: Plug,
  },
  {
    id: "billing",
    label: "Abrechnung",
    description: "Plan, Zahlung, Stripe",
    icon: CreditCard,
  },
];

export type NavigationUserItem = {
  name: string;
  email: string;
  initials: string;
};

export type NavigationUsageInfo = {
  employeeTotal: number;
  activeEmployees: number;
};

function SettingsCheckbox({
  name,
  children,
  defaultChecked = false,
}: {
  name: string;
  children: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="checkbox-row relative cursor-pointer">
      <input
        type="checkbox"
        name={name}
        className="peer absolute inset-0 cursor-pointer opacity-0"
        defaultChecked={defaultChecked}
      />
      <span className="checkbox">
        <Check size={12} strokeWidth={4} />
      </span>
      <span className="checkbox-label">{children}</span>
    </label>
  );
}

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

function SettingsPanel({
  activeCategory,
  tenant,
  user,
  usage,
}: {
  activeCategory: SettingsCategoryId;
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
}) {
  const settings = tenant.settings ?? defaultSettings;
  if (activeCategory === "company") {
    return (
      <div className="flex flex-col gap-4">
        <SettingsSection title="Unternehmensprofil" icon={Building2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-company-name" className="label">
                Unternehmensname
              </label>
              <input
                id="settings-company-name"
                name="companyName"
                className="input bg-white"
                defaultValue={tenant.name}
              />
            </div>
            <div className="field">
              <label htmlFor="settings-company-id" className="label">
                Mandanten-ID
              </label>
              <input
                id="settings-company-id"
                name="tenantId"
                className="input input-mono bg-white"
                defaultValue={tenant.slug ?? tenantSlugFromHref(tenant.href)}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 label">Rechnungsadresse</div>
              <AddressFields
                idPrefix="settings-company-address"
                namePrefix="companyAddress"
                defaults={settings.companyAddress}
              />
            </div>
            <div className="field">
              <label htmlFor="settings-company-tax" className="label">
                USt-ID
              </label>
              <input
                id="settings-company-tax"
                name="taxId"
                className="input input-mono bg-white"
                defaultValue={settings.taxId}
              />
            </div>
          </div>
        </SettingsSection>
        <SettingsSection title="Standards" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-default-location" className="label">
                Hauptstandort
              </label>
              <select
                id="settings-default-location"
                name="defaultLocation"
                className="input cursor-pointer bg-white"
                defaultValue={settings.defaultLocationId}
              >
                <option value="berlin">Berlin</option>
                <option value="hamburg">Hamburg</option>
                <option value="munich">München</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-week-start" className="label">
                Wochenstart
              </label>
              <select
                id="settings-week-start"
                name="weekStart"
                className="input cursor-pointer bg-white"
                defaultValue={settings.weekStart}
              >
                <option value="monday">Montag</option>
                <option value="sunday">Sonntag</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-work-hours" className="label">
                Sollarbeitszeit
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
                Urlaubstage
              </label>
              <input
                id="settings-vacation-days"
                name="vacationDays"
                type="number"
                className="input bg-white"
                defaultValue={settings.vacationDays}
              />
            </div>
          </div>
        </SettingsSection>
        <SettingsSection title="Daten & Aufbewahrung" icon={KeyRound}>
          <div className="flex flex-col gap-3">
            <SettingsCheckbox name="employeeNumberRequired" defaultChecked={settings.employeeNumberRequired}>
              Personalnummer für neue Mitarbeiter verpflichtend
            </SettingsCheckbox>
            <SettingsCheckbox name="archiveFormerEmployees" defaultChecked={settings.archiveFormerEmployees}>
              Ausgeschiedene Mitarbeiter automatisch archivieren
            </SettingsCheckbox>
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (activeCategory === "roles") {
    const tenantSlug = tenant.slug ?? tenantSlugFromHref(tenant.href);

    return (
      <SettingsSection title="Rollen & Rechte" icon={UsersRound}>
        <p className="text-[12.5px] leading-5 text-muted">
          Rollen und Berechtigungen werden auf der eigenen Rollen-Seite
          verwaltet. Dort legen Sie fest, welche Bereiche eine Rolle lesen,
          bearbeiten oder verwalten darf.
        </p>
        <Link
          href={`/u/${tenantSlug}/rollen`}
          className="btn btn-secondary btn-sm mt-3 w-fit"
        >
          <UsersRound size={14} />
          Rollen verwalten
        </Link>
      </SettingsSection>
    );
  }

  if (activeCategory === "notifications") {
    return (
      <SettingsSection title="Benachrichtigungen" icon={Bell}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              Kanäle
            </div>
            <SettingsCheckbox name="mailNotifications" defaultChecked={settings.mailNotifications}>
              E-Mail-Benachrichtigungen
            </SettingsCheckbox>
            <SettingsCheckbox name="inAppNotifications" defaultChecked={settings.inAppNotifications}>
              In-App-Benachrichtigungen
            </SettingsCheckbox>
            <SettingsCheckbox name="mobilePush" defaultChecked={settings.mobilePush}>
              Mobile Push-Nachrichten
            </SettingsCheckbox>
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              Ereignisse
            </div>
            <SettingsCheckbox name="deadlineAlerts" defaultChecked={settings.deadlineAlerts}>
              Fristen und Erinnerungen melden
            </SettingsCheckbox>
            <SettingsCheckbox name="absenceAlerts" defaultChecked={settings.absenceAlerts}>
              Urlaubs- und Krankmeldungen sofort senden
            </SettingsCheckbox>
            <SettingsCheckbox name="shiftAlerts" defaultChecked={settings.shiftAlerts}>
              Schichtplan-Konflikte hervorheben
            </SettingsCheckbox>
          </div>
          <div className="field sm:col-span-2">
            <label htmlFor="settings-digest-time" className="label">
              Wöchentlicher Digest
            </label>
            <select
              id="settings-digest-time"
              name="digestTime"
              className="input cursor-pointer bg-white"
              defaultValue={settings.digestTime}
            >
              <option value="monday-0800">Montag, 08:00 Uhr</option>
              <option value="friday-1600">Freitag, 16:00 Uhr</option>
              <option value="disabled">Deaktiviert</option>
            </select>
          </div>
        </div>
      </SettingsSection>
    );
  }

  if (activeCategory === "security") {
    return (
      <div className="flex flex-col gap-4">
        <SettingsSection title="Login-Sicherheit" icon={ShieldCheck}>
          <p className="text-[12.5px] leading-5 text-muted">
            Zwei-Faktor-Authentifizierung und automatische Sitzungs-Abmeldung
            sind in Vorbereitung und werden hier aktivierbar sein, sobald sie
            verfügbar sind.
          </p>
        </SettingsSection>
        <div className="grid gap-3">
          <div className="field">
            <label htmlFor="settings-audit-retention" className="label">
              Audit-Log-Aufbewahrung
            </label>
            <select
              id="settings-audit-retention"
              name="auditRetentionMonths"
              className="input cursor-pointer bg-white"
              defaultValue={settings.auditRetentionMonths}
            >
              <option value="12">12 Monate</option>
              <option value="24">24 Monate</option>
              <option value="60">5 Jahre</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (activeCategory === "integrations") {
    return (
      <SettingsSection title="Integrationen" icon={Plug}>
        <p className="text-[12.5px] leading-5 text-muted">
          Es sind derzeit keine externen Integrationen verfügbar. Lohn-Export
          (z. B. DATEV), Kalender-Synchronisierung und eine öffentliche API sind
          geplant, aber noch nicht umgesetzt.
        </p>
        <div className="mt-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5">
          <div className="text-[13px] font-semibold text-ink">Dokumentenablage</div>
          <div className="mt-0.5 text-[11.5px] text-muted-2">
            Dateien liegen im S3-Speicher des Mandanten. Verwaltung über den
            Bereich „Dateien“.
          </div>
        </div>
      </SettingsSection>
    );
  }

  if (activeCategory === "billing") {
    return (
      <div className="flex flex-col gap-4">
        <input type="hidden" name="companyName" value={tenant.name} />
        <input
          type="hidden"
          name="tenantId"
          value={tenant.slug ?? tenantSlugFromHref(tenant.href)}
        />
        <SettingsSection title="Abonnement" icon={CreditCard}>
          <div className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-5 text-[#7A4E00]">
            Es ist noch keine Zahlungsabwicklung angebunden. Plan und
            Abrechnungsintervall sind reine Angaben zum Mandanten – es werden
            keine Rechnungen erzeugt und keine Zahlungen eingezogen.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="settings-plan" className="label">
                Plan
              </label>
              <select
                id="settings-plan"
                name="planSelection"
                className="input cursor-pointer bg-white"
                defaultValue={tenant.plan ?? "professional"}
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-payment-interval" className="label">
                Abrechnungsintervall
              </label>
              <select
                id="settings-payment-interval"
                name="paymentInterval"
                className="input cursor-pointer bg-white"
                defaultValue={tenant.billingCycle ?? "monthly"}
              >
                <option value="monthly">Monatlich</option>
                <option value="yearly">Jährlich</option>
              </select>
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor="settings-receipt-email" className="label">
                Rechnungs-E-Mail
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

        <SettingsSection title="Nutzung" icon={Building2}>
          <div className="rounded-[10px] border border-border-light bg-bg px-3 py-2.5">
            <div className="text-[13px] font-semibold text-ink">
              {usage
                ? `${usage.activeEmployees} aktive Mitarbeiter`
                : "Keine Nutzungsdaten verfügbar"}
            </div>
            {usage && (
              <div className="mt-0.5 text-[11.5px] text-muted-2">
                {usage.employeeTotal} Personalakten gesamt
              </div>
            )}
          </div>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Profil" icon={UserCog}>
        <div className="mb-4 flex items-center gap-3 rounded-[10px] bg-bg p-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white">
            {user?.initials ?? "–"}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink">{user?.name ?? "Angemeldet"}</div>
            <div className="mt-0.5 text-[12px] text-muted-2">
              {tenant.role} bei {tenant.name}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="settings-account-name" className="label">
              Anzeigename
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
              E-Mail
            </label>
            <input
              id="settings-account-email"
              className="input bg-bg"
              defaultValue={user?.email ?? ""}
              readOnly
              aria-describedby="settings-account-email-hint"
            />
            <p id="settings-account-email-hint" className="mt-1 text-[11.5px] text-muted">
              Die Anmelde-E-Mail kann derzeit nicht selbst geändert werden.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Passwort & Konto" icon={KeyRound}>
        <p className="text-[12.5px] leading-5 text-muted">
          Passwort ändern und das Konto endgültig löschen erfolgt auf der
          Kontoseite.
        </p>
        <Link href="/konto" className="btn btn-secondary btn-sm mt-3 w-fit">
          <UserCog size={14} />
          Konto verwalten
        </Link>
      </SettingsSection>
    </div>
  );
}

function SettingsPopupForm({
  tenant,
  user,
  usage,
  onDone,
}: {
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
  onDone: () => void;
}) {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("account");

  const activeCategoryLabel =
    settingsCategories.find((category) => category.id === activeCategory)?.label ??
    "Konto";

  return (
    <form
      action={saveSettingsPopupAction}
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
        aria-label="Einstellungskategorien"
        className="border-b border-white/[0.08] bg-[#0D0D0D] p-3 md:row-span-2 md:border-r md:border-b-0"
      >
        <div className="mb-3 px-2 pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5E5E5B]">
          Einstellungen
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {settingsCategories.map((category) => {
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
            Bereich
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
          />
        </div>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border-soft bg-white px-6 py-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={Save}
          pendingLabel="Wird gespeichert..."
        >
          Speichern
        </FormSubmitButton>
      </div>
    </form>
  );
}

function SettingsPopup({
  tenant,
  user,
  usage,
  onClose,
}: {
  tenant: TenantItem;
  user?: NavigationUserItem;
  usage?: NavigationUsageInfo | null;
  onClose: () => void;
}) {
  return (
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
        aria-label="Einstellungen"
        className="relative h-[min(760px,100svh)] w-full max-w-[1040px] overflow-hidden rounded-card bg-white shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
      >
        <button
          type="button"
          aria-label="Einstellungen schließen"
          title="Schließen"
          className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          onClick={onClose}
        >
          <X size={15} strokeWidth={2} />
        </button>

        <SettingsPopupForm
          tenant={tenant}
          user={user}
          usage={usage}
          onDone={onClose}
        />
      </div>
    </div>
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
        aria-label="Benachrichtigungen"
        className="relative flex max-h-[calc(100svh-32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-card bg-white shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:max-h-[620px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              Inbox
            </div>
            <div className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
              Benachrichtigungen
            </div>
          </div>

          <button
            type="button"
            aria-label="Benachrichtigungen schließen"
            title="Schließen"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            onClick={onClose}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border-soft bg-bg px-5 py-3">
          <div className="text-[12.5px] text-muted-2">
            {hasUnread
              ? `${unreadNotifications.length} ungelesen`
              : "Alles gelesen"}
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
            Als gelesen markieren
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {notifications.length === 0 && (
              <p className="rounded-[12px] border border-border-soft bg-white p-3 text-[12.5px] text-muted">
                Keine Benachrichtigungen – alles erledigt.
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
                      Gelesen
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
}: {
  tenants?: NavigationTenantItem[];
  user?: NavigationUserItem;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  // Antwort inkl. Mandant, damit beim Mandantenwechsel nicht kurz die Daten
  // des vorherigen Mandanten stehen bleiben.
  const [fetchedData, setFetchedData] = useState<{
    tenant: string;
    notifications: NotificationItem[];
    usage: NavigationUsageInfo | null;
  } | null>(null);
  const tenantSelectorRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useParams<{ tenant?: string | string[] }>();

  const routeTenant = Array.isArray(params.tenant) ? params.tenant[0] : params.tenant;
  const tenant = routeTenant ?? tenantSlugFromPathname(pathname);
  const baseHref = tenant ? `/u/${tenant}` : "/u";
  const tenantItems = tenants.length > 0 ? tenants : [fallbackTenantItem];
  const isCurrentTenantData = Boolean(tenant) && fetchedData?.tenant === tenant;
  const notifications = isCurrentTenantData ? fetchedData!.notifications : [];
  const usage = isCurrentTenantData ? fetchedData!.usage : null;
  const toggleLabel = isCollapsed ? "Navigation ausklappen" : "Navigation einklappen";
  const unreadNotificationCount = notifications.filter(
    (notification) => !readNotificationIds.includes(notification.id),
  ).length;
  const activeTenant =
    tenantItems.find((item) => item.href === baseHref) ??
    (tenant
      ? {
          ...fallbackTenantItem,
          name: tenant,
          role: "Unbekanntes Unternehmen",
          mark: tenant.slice(0, 1).toUpperCase(),
          href: baseHref,
        }
      : tenantItems[0]);

  const items = useMemo(
    () =>
      navigationItems.map((item) => {
        const href = `${baseHref}${item.href}`;

        return {
          ...item,
          href,
          isActive:
            item.href === ""
              ? pathname === baseHref
              : pathname === href || pathname.startsWith(`${href}/`),
        };
      }),
    [baseHref, pathname],
  );

  useEffect(() => {
    if (!tenant) {
      return;
    }

    let cancelled = false;

    fetch(`/api/me/notifications?tenant=${encodeURIComponent(tenant)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (data: {
          notifications?: NotificationItem[];
          usage?: NavigationUsageInfo | null;
        } | null) => {
          if (!cancelled && data) {
            setFetchedData({
              tenant,
              notifications: data.notifications ?? [],
              usage: data.usage ?? null,
            });
          }
        },
      )
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [tenant]);

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
    <aside className={cx("sidebar", isCollapsed && "sidebar-collapsed")}>
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
              <span className="sidebar-brand-subtitle">Personalakte</span>
            </span>
          </Link>
        )}

        <button
          type="button"
          className="sidebar-toggle"
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
      </div>

      <nav className="sidebar-nav" aria-label="Hauptnavigation">
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
                  Unternehmen wechseln
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
          title="Einstellungen"
          className="sidebar-link w-full appearance-none border-0 bg-transparent text-left"
          aria-haspopup="dialog"
          onClick={() => {
            setIsTenantMenuOpen(false);
            setIsSettingsOpen(true);
          }}
        >
          <span className="sidebar-link-code">Eg</span>
          {!isCollapsed && <span className="sidebar-link-label">Einstellungen</span>}
        </button>

        <form action="/logout" method="post">
          <button
            type="submit"
            title="Abmelden"
            className="sidebar-link w-full appearance-none border-0 bg-transparent text-left"
          >
            <span className="sidebar-link-code">
              <LogOut size={14} strokeWidth={2} />
            </span>
            {!isCollapsed && <span className="sidebar-link-label">Abmelden</span>}
          </button>
        </form>

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
                <div className="sidebar-user-name">{user?.name ?? "Angemeldet"}</div>
                <div className="sidebar-user-role">{activeTenant.role}</div>
              </div>
            )}
          </div>

          <div className="sidebar-notification" ref={notificationRef}>
            <button
              type="button"
              className="sidebar-notification-button"
              title="Benachrichtigungen"
              aria-label={
                unreadNotificationCount > 0
                  ? `${unreadNotificationCount} ungelesene Benachrichtigungen`
                  : "Benachrichtigungen"
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
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

    </aside>
  );
}
