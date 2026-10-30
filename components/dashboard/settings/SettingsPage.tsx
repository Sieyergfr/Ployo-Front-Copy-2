"use client";

import {
  openBillingPortalAction,
  saveHolidayRegionsSectionAction,
  savePreferencesSectionAction,
  saveSettingsSectionAction,
  saveShiftSettingsSectionAction,
  startBillingCheckoutAction,
} from "@/app/(dashboard)/u/[tenant]/einstellungen/actions";
import { useDatePreference } from "@/components/DatePreferences";
import { preferredDateFormatter } from "@/lib/date-picker";
import AddressFields from "@/components/AddressFields";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import {
  SettingsForm,
  InfoNote,
  SettingSegments,
  SettingSwitch,
  SettingsCard,
  SettingsRow,
  SoonBadge,
  useSettingsForm,
} from "@/components/dashboard/settings/SettingsBits";
import { avatarColor, ctaClass, smallActionClass } from "@/components/dashboard/ui";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import { useActionStateWithToast } from "@/components/Toasts";
import { BUNDESLAENDER } from "@/lib/german-holidays";
import { SETTINGS_CATEGORIES, type SettingsCategory } from "@/components/dashboard/settings/settings-categories";
import type { SettingsPageData } from "@/lib/settings-page";
import { DEFAULT_SHIFT_PRESET_COLOR, type ShiftPreset } from "@/lib/shift-presets";
import { tenantIndustries, tenantSizes } from "@/lib/tenant-options";
import { hasPermissionLevel, type PermissionLevel } from "@/lib/roles";
import {
  Bell,
  Building2,
  CreditCard,
  Download,
  FileText,
  Lock,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  UserRound,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";


const ICONS: Record<SettingsCategory, LucideIcon> = {
  account: UserRound,
  company: Building2,
  security: ShieldCheck,
  timeTracking: Timer,
  shifts: CalendarDays,
  notifications: Bell,
  billing: CreditCard,
  integrations: Plug,
};

const GROUPS: Array<{ id: string; items: SettingsCategory[] }> = [
  { id: "personal", items: ["account"] },
  { id: "company", items: ["company", "security"] },
  { id: "daily", items: ["timeTracking", "shifts", "notifications"] },
  { id: "subscription", items: ["billing", "integrations"] },
];

/** Welche Kategorie welches Recht braucht (wie im bisherigen Dialog). */
function requiredLevel(category: SettingsCategory): { area: "settings" | "roles"; level: PermissionLevel } | null {
  if (category === "account" || category === "security") return null;
  if (category === "integrations") return { area: "settings", level: "admin" };

  return { area: "settings", level: "write" };
}

const TIMEZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/London"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

export default function SettingsPage({ data, category }: { data: SettingsPageData; category: SettingsCategory }) {
  const t = useTranslations("SettingsPage");
  const [query, setQuery] = useState("");
  const base = `/u/${data.tenant.slug}/einstellungen`;
  const visible = SETTINGS_CATEGORIES.filter((item) => {
    const need = requiredLevel(item);

    return !need || hasPermissionLevel(data.permissions[need.area] ?? "none", need.level);
  });
  const active = visible.includes(category) ? category : "account";
  const needle = query.trim().toLocaleLowerCase();
  const matches = (item: SettingsCategory) =>
    !needle || `${t(`category.${item}.label`)} ${t(`category.${item}.description`)}`.toLocaleLowerCase().includes(needle);
  const Icon = ICONS[active];
  const scopeIsCompany = active !== "account";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label={t("navLabel")} className="flex flex-col gap-1 lg:sticky lg:top-6">
        <label className="relative mb-2">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className={`${dbInputClass} bg-white pl-9`} />
        </label>
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => visible.includes(item) && matches(item));

          if (items.length === 0) return null;

          return (
            <div key={group.id} className="flex flex-col gap-0.5">
              <span className="mt-2 mb-1 px-2.5 font-mono text-[10px] tracking-[0.12em] text-[#9a9a96] uppercase">{t(`group.${group.id}`)}</span>
              {items.map((item) => {
                const ItemIcon = ICONS[item];
                const isActive = item === active;
                const href = `${base}?kat=${item}`;

                return (
                  <Link
                    key={item}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-[12px] border px-2.5 py-2 no-underline ${
                      isActive ? "db-card border-[#ecebe7] bg-white text-ink" : "border-transparent text-ink hover:bg-white/70"
                    }`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] ${isActive ? "bg-[rgba(139,111,224,0.12)] text-[#6b4fc4]" : "bg-[#f2f1ed] text-[#6e6e6b]"}`}>
                      <ItemIcon size={15} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[14px] font-semibold">{t(`category.${item}.label`)}</span>
                      <span className="truncate text-[12px] text-[#6e6e6b]">{t(`category.${item}.description`)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[12px] bg-ink text-white">
            <Icon size={19} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.4px]">{t(`category.${active}.label`)}</h2>
            <span className="text-[13px] text-[#6e6e6b]">{t(`category.${active}.description`)}</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-[rgba(139,111,224,0.3)] bg-[rgba(139,111,224,0.08)] px-2.5 py-1 text-[12px] font-semibold text-[#6b4fc4]">
            {scopeIsCompany ? <Building2 size={12} /> : <UserRound size={12} />}
            {scopeIsCompany ? t("scopeCompany", { name: data.tenant.name }) : t("scopeAccount")}
          </span>
        </div>

        {active === "account" && <AccountPanel data={data} />}
        {active === "company" && <CompanyPanel data={data} />}
        {active === "security" && <SecurityPanel data={data} />}
        {active === "timeTracking" && <TimeTrackingPanel data={data} />}
        {active === "shifts" && <ShiftsPanel data={data} />}
        {active === "notifications" && <NotificationsPanel data={data} />}
        {active === "billing" && <BillingPanel data={data} />}
        {active === "integrations" && <IntegrationsPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Konto
// ---------------------------------------------------------------------------

function AccountPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const router = useRouter();
  const prefs = data.preferences;
  const today = new Date();
  const sample = (format: string) => {
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = String(today.getFullYear());

    return format === "yyyy-mm-dd" ? `${yyyy}-${mm}-${dd}` : format === "mm/dd/yyyy" ? `${mm}/${dd}/${yyyy}` : `${dd}.${mm}.${yyyy}`;
  };
  const [dateFormat, setDateFormat] = useState(prefs.dateFormat);

  return (
    <>
      <SettingsForm action={saveSettingsSectionAction} hidden={{ tenant: data.tenant.slug, category: "account" }} onSaved={() => router.refresh()}>
        <SettingsCard title={t("account.profile")}>
          <div className="flex items-center gap-3 border-b border-[#f0efeb] py-3.5">
            <span className="flex size-12 items-center justify-center rounded-full text-[16px] font-bold text-white" style={{ background: avatarColor(data.user.id) }}>
              {initials(data.user.name)}
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{data.user.name}</span>
              <span className="text-[13px] text-[#6e6e6b]">{t("account.roleAt", { role: t(`role.${data.role}`), company: data.tenant.name })}</span>
            </span>
          </div>
          <SettingsRow label={t("account.displayName")} hint={t("account.displayNameHint")}>
            <input name="accountName" defaultValue={data.user.name} className={dbInputClass} required maxLength={80} aria-label={t("account.displayName")} />
          </SettingsRow>
          <SettingsRow label={t("account.email")} hint={t("account.emailHint")}>
            <span className={`${dbInputClass} flex items-center gap-2 border-dashed text-[#3d3d3a]`}>
              <Lock size={14} className="text-[#9a9a96]" />
              {data.user.email}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsForm>

      <SettingsCard title={t("account.passwordAccount")}>
        <SettingsRow label={t("account.password")} hint={t("account.passwordHint")}>
          <Link href="/konto#passwort" className={`${smallActionClass} bg-white`}>
            {t("account.changePassword")}
          </Link>
        </SettingsRow>
        <SettingsRow label={t("account.delete")} hint={t("account.deleteHint")}>
          <Link href="/konto#konto-loeschen" className={`${smallActionClass} border-[rgba(180,51,42,0.35)] bg-white text-[#b4332a]`}>
            {t("account.deleteButton")}
          </Link>
        </SettingsRow>
      </SettingsCard>

      <SettingsForm action={savePreferencesSectionAction} onSaved={() => router.refresh()}>
        <SettingsCard title={t("account.languageDisplay")}>
          <SettingsRow label={t("account.language")} hint={t("account.languageHint")}>
            <SettingSegments
              name="language"
              label={t("account.language")}
              defaultValue={prefs.language === "en" ? "en" : "de"}
              options={[
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
              ]}
            />
          </SettingsRow>
          <SettingsRow label={t("account.dateFormat")} hint={t("account.dateFormatHint", { example: sample(dateFormat) })}>
            <SettingSegments
              name="dateFormat"
              label={t("account.dateFormat")}
              defaultValue={prefs.dateFormat}
              onChange={setDateFormat}
              options={[
                { value: "dd.mm.yyyy", label: "TT.MM.JJJJ" },
                { value: "yyyy-mm-dd", label: "JJJJ-MM-TT" },
                { value: "mm/dd/yyyy", label: "MM/TT/JJJJ" },
              ]}
            />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title={t("account.myNotifications")} subtitle={t("account.myNotificationsHint")}>
          <SettingsRow label={t("account.notifyVacation")} hint={t("account.notifyVacationHint")}>
            <SettingSwitch name="notifyVacationEvents" defaultChecked={prefs.notifyVacationEvents} label={t("account.notifyVacation")} />
          </SettingsRow>
          <SettingsRow label={t("account.notifyShifts")} hint={t("account.notifyShiftsHint")}>
            <SettingSwitch name="notifyShiftEvents" defaultChecked={prefs.notifyShiftEvents} label={t("account.notifyShifts")} />
          </SettingsRow>
        </SettingsCard>
      </SettingsForm>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unternehmen
// ---------------------------------------------------------------------------

/** Felder, die `saveSettingsPopupCategory("company")` immer vollständig erwartet. */
function companyHidden(data: SettingsPageData) {
  return {
    tenant: data.tenant.slug,
    category: "company",
    country: data.tenant.country ?? "DE",
    logoUrl: data.tenant.logoUrl,
    primaryColor: data.tenant.primaryColor ?? "#2A6FDB",
    plan: data.tenant.plan ?? "professional",
    billingCycle: data.tenant.billingCycle ?? "monthly",
  };
}

function CompanyPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const tAddress = useTranslations("AddressFields");
  const router = useRouter();
  const settings = data.settings;
  const slug = data.tenant.slug;

  if (!settings) return null;

  return (
    <SettingsForm
      action={saveSettingsSectionAction}
      hidden={companyHidden(data)}
      onSaved={(result) => {
        if (result.slug) {
          router.replace(`/u/${result.slug}/einstellungen?kat=company`);
        } else {
          router.refresh();
        }
      }}
    >
      <SettingsCard title={t("company.profile")}>
        <div className="flex items-center gap-3 border-b border-[#f0efeb] py-3.5">
          <span className="flex size-12 items-center justify-center rounded-[12px] bg-[#2c64c9] text-[16px] font-bold text-white">{initials(data.tenant.name)}</span>
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">{data.tenant.name}</span>
            <span className="font-mono text-[12px] text-[#6e6e6b]">ployo.io/u/{slug}</span>
          </span>
        </div>
        <SettingsRow label={t("company.name")} hint={t("company.nameHint")}>
          <input name="companyName" defaultValue={data.tenant.name} className={dbInputClass} required maxLength={120} aria-label={t("company.name")} />
        </SettingsRow>
        <SettingsRow label={t("company.slug")} hint={t("company.slugHint")}>
          <span className="flex">
            <span className="flex items-center rounded-l-[10px] border border-r-0 border-[#e4e3df] bg-[#f2f1ed] px-2.5 font-mono text-[12px] text-[#6e6e6b]">ployo.io/u/</span>
            <input
              name="tenantId"
              defaultValue={data.tenant.slug}
              readOnly
              aria-readonly="true"
              className={`${dbInputClass} rounded-l-none`}
              required
              pattern="[a-z0-9-]{3,48}"
              aria-label={t("company.slug")}
            />
          </span>
        </SettingsRow>
        <SettingsRow label={t("company.contactEmail")} hint={t("company.contactEmailHint")}>
          <input name="contactEmail" type="email" defaultValue={data.tenant.contactEmail} className={dbInputClass} aria-label={t("company.contactEmail")} />
        </SettingsRow>
        <SettingsRow label={t("company.industry")}>
          <select name="industry" defaultValue={data.tenant.industry} className={`${dbInputClass} cursor-pointer`} aria-label={t("company.industry")}>
            <option value="">{t("company.notSpecified")}</option>
            {[...new Set([...tenantIndustries, data.tenant.industry].filter(Boolean))].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label={t("company.size")}>
          <select name="size" defaultValue={data.tenant.size} className={`${dbInputClass} cursor-pointer`} aria-label={t("company.size")}>
            <option value="">{t("company.notSpecified")}</option>
            {tenantSizes.map((item) => (
              <option key={item} value={item}>
                {t("company.sizeOption", { size: item })}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("company.billingAddress")} subtitle={t("company.billingAddressHint")}>
        <div className="py-3.5">
          <AddressFields idPrefix="settings-company-address" namePrefix="companyAddress" defaults={data.tenant.companyAddress} t={tAddress} />
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("company.vatId")}</span>
            <input name="taxId" defaultValue={settings.taxId} className={dbInputClass} maxLength={64} />
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title={t("company.defaults")} subtitle={t("company.defaultsHint")}>
        <SettingsRow label={t("company.defaultLocation")} hint={t("company.defaultLocationHint")}>
          <select name="defaultLocation" defaultValue={settings.defaultLocationId} className={`${dbInputClass} cursor-pointer`} aria-label={t("company.defaultLocation")}>
            <option value="">{data.locations.length ? t("company.noDefaultLocation") : t("company.noLocations")}</option>
            {data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label={t("company.timezone")} hint={t("company.timezoneHint")}>
          <select name="timezone" defaultValue={data.tenant.timezone ?? "Europe/Berlin"} className={`${dbInputClass} cursor-pointer`} aria-label={t("company.timezone")}>
            {[...new Set([...TIMEZONES, data.tenant.timezone ?? "Europe/Berlin"])].map((zone) => (
              <option key={zone} value={zone}>
                {t.has(`timezone.${zone.replace("/", "_")}`) ? t(`timezone.${zone.replace("/", "_")}`) : zone}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label={t("company.weekStart")} hint={t("company.weekStartHint")}>
          <SettingSegments
            name="weekStart"
            label={t("company.weekStart")}
            defaultValue={settings.weekStart === "sunday" ? "sunday" : "monday"}
            options={[
              { value: "monday", label: t("monday") },
              { value: "sunday", label: t("sunday") },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("company.vacationDays")} hint={t("company.vacationDaysHint")}>
          <span className="flex">
            <input name="vacationDays" type="number" min={0} max={60} defaultValue={settings.vacationDays} className={`${dbInputClass} rounded-r-none`} aria-label={t("company.vacationDays")} />
            <span className="flex items-center rounded-r-[10px] border border-l-0 border-[#e4e3df] bg-[#f2f1ed] px-3 text-[13px] whitespace-nowrap text-[#6e6e6b]">{t("company.daysPerYear")}</span>
          </span>
        </SettingsRow>
        <SettingsRow label={t("company.workHours")} hint={t("company.workHoursHint")}>
          <input name="workHours" type="number" min={0} max={168} step="any" inputMode="decimal" required defaultValue={settings.workHours} className={dbInputClass} aria-label={t("company.workHours")} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("company.employeeNumbers")}>
        <SettingsRow label={t("company.prefixSuffix")} hint={t("company.prefixSuffixHint")}>
          <span className="grid grid-cols-2 gap-2">
            <input name="employeeNumberPrefix" defaultValue={settings.employeeNumberPrefix} className={dbInputClass} placeholder={t("company.prefix")} maxLength={16} aria-label={t("company.prefix")} />
            <input name="employeeNumberSuffix" defaultValue={settings.employeeNumberSuffix} className={dbInputClass} placeholder={t("company.suffix")} maxLength={16} aria-label={t("company.suffix")} />
          </span>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("company.data")}>
        <SettingsRow label={t("company.archiveFormer")} hint={t("company.archiveFormerHint")}>
          <SettingSwitch name="archiveFormerEmployees" defaultChecked={settings.archiveFormerEmployees} label={t("company.archiveFormer")} />
        </SettingsRow>
        <SettingsRow label={t("company.export")} hint={t("company.exportHint")}>
          <a href={`/api/tenants/${data.tenant.slug}/export`} className={`${smallActionClass} bg-white`}>
            <Download size={14} />
            {t("company.exportButton")}
          </a>
        </SettingsRow>
        <SettingsRow label={t("company.register")} hint={t("company.registerHint")}>
          <Link href={`/u/${data.tenant.slug}/verarbeitungsverzeichnis`} className={`${smallActionClass} bg-white`}>
            <FileText size={14} />
            {t("company.registerButton")}
          </Link>
        </SettingsRow>
      </SettingsCard>
    </SettingsForm>
  );
}

// ---------------------------------------------------------------------------
// Sicherheit
// ---------------------------------------------------------------------------

function SecurityPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const canManage = hasPermissionLevel(data.permissions.settings ?? "none", "write");
  const settings = data.settings;

  return (
    <>
      <SettingsForm action={saveSettingsSectionAction} hidden={{ tenant: data.tenant.slug, category: "security" }}>
        <SettingsCard title={t("security.login")}>
          <SettingsRow label={t("security.twoFactorRequired")} hint={t("security.twoFactorRequiredHint")}>
            <SettingSwitch name="twoFactorRequired" defaultChecked={settings?.twoFactorRequired ?? false} label={t("security.twoFactorRequired")} disabled={!canManage} />
          </SettingsRow>
          <SettingsRow label={t("security.ownTwoFactor")} hint={t("security.ownTwoFactorHint")}>
            <Link href="/konto#zwei-faktor" className={`${smallActionClass} bg-white`}>
              <ShieldCheck size={14} />
              {t("security.manageOwn")}
            </Link>
          </SettingsRow>
        </SettingsCard>
        <SettingsCard title={t("security.audit")}>
          <SettingsRow label={t("security.auditRetention")} hint={canManage ? t("security.auditRetentionHint") : t("security.writeRequired")}>
            <select name="auditRetentionMonths" defaultValue={String(settings?.auditRetentionMonths ?? 24)} disabled={!canManage} className={`${dbInputClass} cursor-pointer disabled:opacity-60`} aria-label={t("security.auditRetention")}>
              <option value="12">{t("security.months", { count: 12 })}</option>
              <option value="24">{t("security.months", { count: 24 })}</option>
              <option value="60">{t("security.years", { count: 5 })}</option>
            </select>
          </SettingsRow>
          {hasPermissionLevel(data.permissions.audit ?? "none", "read") && (
            <SettingsRow label={t("security.auditLog")} hint={t("security.auditLogHint")}>
              <Link href={`/u/${data.tenant.slug}/audit`} className={`${smallActionClass} bg-white`}>
                {t("security.openAuditLog")}
              </Link>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsForm>
    </>
  );
}

// ---------------------------------------------------------------------------
// Zeiterfassung
// ---------------------------------------------------------------------------

function TimeTrackingPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const s = data.settings;
  const [mode, setMode] = useState(s?.timeTrackingClockInMode === "shift" ? "shift" : "always");

  if (!s) return null;

  return (
    <SettingsForm action={saveSettingsSectionAction} hidden={{ tenant: data.tenant.slug, category: "timeTracking" }}>
      <SettingsCard title={t("time.clock")}>
        <SettingsRow label={t("time.enabled")} hint={t("time.enabledHint")}>
          <SettingSwitch name="timeTrackingEnabled" defaultChecked={s.timeTrackingEnabled} label={t("time.enabled")} />
        </SettingsRow>
        <InfoNote>{t("time.worksCouncil")}</InfoNote>
      </SettingsCard>

      <SettingsCard title={t("time.clockIn")}>
        <SettingsRow label={t("time.clockInMode")} stacked>
          <ClockModePicker mode={mode} setMode={setMode} />
        </SettingsRow>
        {mode === "shift" && (
          <SettingsRow label={t("time.leadMinutes")} hint={t("time.leadMinutesHint")}>
            <input name="timeTrackingClockInLeadMinutes" type="number" min={0} max={240} defaultValue={s.timeTrackingClockInLeadMinutes} className={dbInputClass} aria-label={t("time.leadMinutes")} />
          </SettingsRow>
        )}
        {mode !== "shift" && <input type="hidden" name="timeTrackingClockInLeadMinutes" value={s.timeTrackingClockInLeadMinutes} />}
        <SettingsRow label={t("time.qrIn")} hint={t("time.qrInHint")}>
          <SettingSwitch name="timeTrackingQrRequired" defaultChecked={s.timeTrackingQrRequired} label={t("time.qrIn")} />
        </SettingsRow>
        <SettingsRow label={t("time.qrOut")} hint={t("time.qrOutHint")}>
          <SettingSwitch name="timeTrackingQrRequiredClockOut" defaultChecked={s.timeTrackingQrRequiredClockOut} label={t("time.qrOut")} />
        </SettingsRow>
        <InfoNote>
          {t("time.qrNote")}{" "}
          <Link href={`/u/${data.tenant.slug}/standorte`} className="font-semibold text-[#2c64c9] underline">
            {t("time.toLocations")}
          </Link>
        </InfoNote>
      </SettingsCard>

      <SettingsCard title={t("time.breaks")}>
        <SettingsRow label={t("time.breaksEnabled")} hint={t("time.breaksEnabledHint")}>
          <SettingSwitch name="timeTrackingBreaksEnabled" defaultChecked={s.timeTrackingBreaksEnabled} label={t("time.breaksEnabled")} />
        </SettingsRow>
        <SettingsRow label={t("time.autoBreak")} hint={t("time.autoBreakHint")}>
          <SettingSwitch name="timeTrackingAutoBreakDeduction" defaultChecked={s.timeTrackingAutoBreakDeduction} label={t("time.autoBreak")} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("time.forgotten")}>
        <SettingsRow label={t("time.autoClockOut")} hint={t("time.autoClockOutHint")}>
          <SettingSwitch name="timeTrackingAutoClockOut" defaultChecked={s.timeTrackingAutoClockOut} label={t("time.autoClockOut")} />
        </SettingsRow>
        <SettingsRow label={t("time.afterShift")} hint={t("time.afterShiftHint")}>
          <input name="timeTrackingAutoClockOutAfterShiftMinutes" type="number" min={0} max={720} defaultValue={s.timeTrackingAutoClockOutAfterShiftMinutes} className={dbInputClass} aria-label={t("time.afterShift")} />
        </SettingsRow>
        <SettingsRow label={t("time.maxHours")} hint={t("time.maxHoursHint")}>
          <input name="timeTrackingAutoClockOutMaxHours" type="number" min={1} max={24} defaultValue={s.timeTrackingAutoClockOutMaxHours} className={dbInputClass} aria-label={t("time.maxHours")} />
        </SettingsRow>
      </SettingsCard>
    </SettingsForm>
  );
}

function ClockModePicker({ mode, setMode }: { mode: string; setMode: (mode: string) => void }) {
  const t = useTranslations("SettingsPage");
  const { markDirty } = useSettingsForm();

  return (
    <div role="radiogroup" aria-label={t("time.clockInMode")} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="timeTrackingClockInMode" value={mode} />
      {(["always", "shift"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={mode === option}
          onClick={() => {
            setMode(option);
            markDirty();
          }}
          className={`flex cursor-pointer items-start gap-2.5 rounded-[12px] border bg-white px-3.5 py-3 text-left ${mode === option ? "border-[#8b6fe0] shadow-[0_0_0_1px_#8b6fe0]" : "border-[#e4e3df]"}`}
        >
          <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${mode === option ? "border-[#8b6fe0]" : "border-[#cfcec9]"}`}>
            {mode === option && <span className="size-2 rounded-full bg-[#8b6fe0]" />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold">{t(`time.mode.${option}`)}</span>
            <span className="text-[12.5px] text-[#6e6e6b]">{t(`time.mode.${option}Hint`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schichtplanung
// ---------------------------------------------------------------------------

function presetNetMinutes(preset: ShiftPreset) {
  const [sh, sm] = preset.start.split(":").map(Number);
  const [eh, em] = preset.end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);

  if (minutes <= 0) minutes += 24 * 60;

  return Math.max(0, minutes - (Number.parseInt(preset.pause, 10) || 0));
}

function ShiftsPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const locale = useLocale();
  const s = data.settings;
  const [presets, setPresets] = useState<ShiftPreset[]>(s?.shiftPresets ?? []);

  if (!s) return null;

  return (
    <>
      <SettingsForm action={saveShiftSettingsSectionAction} hidden={{ tenant: data.tenant.slug, weekStart: s.weekStart, presets: JSON.stringify(presets) }}>
        <SettingsCard title={t("shifts.defaults")} subtitle={t("shifts.defaultsHint")}>
          <SettingsRow label={t("company.weekStart")} hint={t("shifts.weekStartHint")}>
            <span className={`${dbInputClass} flex items-center justify-between border-dashed`}>
              {s.weekStart === "sunday" ? t("sunday") : t("monday")}
              <Link href={`/u/${data.tenant.slug}/einstellungen?kat=company`} className="text-[13px] font-semibold text-[#6b4fc4] underline">
                {t("change")}
              </Link>
            </span>
          </SettingsRow>
          <SettingsRow label={t("shifts.minStaffing")} hint={t("shifts.minStaffingHint")}>
            <span className="flex">
              <input name="minStaffing" type="number" min={0} max={99} defaultValue={s.shiftMinStaffing} className={`${dbInputClass} rounded-r-none`} aria-label={t("shifts.minStaffing")} />
              <span className="flex items-center rounded-r-[10px] border border-l-0 border-[#e4e3df] bg-[#f2f1ed] px-3 text-[13px] text-[#6e6e6b]">{t("shifts.persons")}</span>
            </span>
          </SettingsRow>
          <SettingsRow label={t("shifts.breakRule")} hint={t("shifts.breakRuleHint")}>
            <select name="breakRule" defaultValue={s.shiftBreakRule} className={`${dbInputClass} cursor-pointer`} aria-label={t("shifts.breakRule")}>
              {["none", "15-4", "30-6", "45-9"].map((rule) => (
                <option key={rule} value={rule}>
                  {t(`shifts.breakRuleOption.${rule.replace("-", "_")}`)}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title={t("shifts.arbzg")} subtitle={t("shifts.arbzgHint")}>
          <SettingsRow label={t("shifts.minRest")} hint={t("shifts.minRestHint")}>
            <select name="minRestHours" defaultValue={String(s.minRestHours)} className={`${dbInputClass} cursor-pointer`} aria-label={t("shifts.minRest")}>
              {[11, 12, 13, 14].map((hours) => (
                <option key={hours} value={hours}>
                  {hours === 11 ? t("shifts.hoursLegal", { count: hours }) : t("shifts.hours", { count: hours })}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow label={t("shifts.maxShift")} hint={t("shifts.maxShiftHint")}>
            <select name="maxShiftHours" defaultValue={String(s.maxShiftHours)} className={`${dbInputClass} cursor-pointer`} aria-label={t("shifts.maxShift")}>
              {[10, 9, 8].map((hours) => (
                <option key={hours} value={hours}>
                  {hours === 10 ? t("shifts.hoursLegal", { count: hours }) : t("shifts.hours", { count: hours })}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow label={t("shifts.overtimeWarning")} hint={t("shifts.overtimeWarningHint")}>
            <select name="overtimeWarningPercent" defaultValue={String(s.overtimeWarningPercent)} className={`${dbInputClass} cursor-pointer`} aria-label={t("shifts.overtimeWarning")}>
              {[0, 5, 10, 15, 20, 25].map((percent) => (
                <option key={percent} value={percent}>
                  {t("shifts.overtimeOption", { percent })}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title={t("shifts.planningApp")}>
          <SettingsRow label={t("shifts.swap")} hint={t("shifts.swapHint")} badge={<SoonBadge />}>
            <span className="flex justify-end opacity-50">
              <span className="h-6 w-[42px] rounded-full bg-[#dcdbd6]" />
            </span>
          </SettingsRow>
          <SettingsRow label={t("shifts.openShifts")} hint={t("shifts.openShiftsHint")} badge={<SoonBadge />}>
            <span className="flex justify-end opacity-50">
              <span className="h-6 w-[42px] rounded-full bg-[#dcdbd6]" />
            </span>
          </SettingsRow>
          <SettingsRow label={t("shifts.notifyOnPublish")} hint={t("shifts.notifyOnPublishHint")}>
            <SettingSwitch name="notifyOnPublish" defaultChecked={s.shiftNotifyOnPublish} label={t("shifts.notifyOnPublish")} />
          </SettingsRow>
        </SettingsCard>

        <OpeningHoursCard data={data} />

        <PresetsCard presets={presets} setPresets={setPresets} locale={locale} />
      </SettingsForm>

      <HolidaysCard data={data} />
    </>
  );
}

function OpeningHoursCard({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const { markDirty } = useSettingsForm();

  return (
    <SettingsCard title={t("shifts.openingHours")} subtitle={t("shifts.openingHoursHint")}>
      <div className="py-3.5" onClick={() => markDirty()}>
        <OpeningHoursEditor name="defaultOpeningHours" defaultValue={data.settings?.defaultOpeningHours ?? []} />
      </div>
    </SettingsCard>
  );
}

function PresetsCard({
  presets,
  setPresets,
  locale,
}: {
  presets: ShiftPreset[];
  setPresets: (update: (current: ShiftPreset[]) => ShiftPreset[]) => void;
  locale: string;
}) {
  const t = useTranslations("SettingsPage");
  const { markDirty } = useSettingsForm();
  const update = (id: string, patch: Partial<ShiftPreset>) => {
    setPresets((current) => current.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)));
    markDirty();
  };

  return (
    <SettingsCard title={t("shifts.presets")} subtitle={t("shifts.presetsHint")}>
      <div className="flex flex-col gap-2 py-3.5">
        {presets.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{t("shifts.noPresets")}</p>}
        {presets.map((preset) => (
          <div key={preset.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[#ecebe7] px-3 py-2">
            <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[9px] border border-[#dedad4]" title={t("shifts.presetColor")}>
              <span className="pointer-events-none size-5 rounded-full" style={{ backgroundColor: preset.color }} />
              <input type="color" value={preset.color} onChange={(event) => update(preset.id, { color: event.target.value })} aria-label={t("shifts.presetColor")} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
            <input value={preset.label} onChange={(event) => update(preset.id, { label: event.target.value })} className={`${dbInputClass} min-h-9 max-w-[180px] py-1.5`} aria-label={t("shifts.presetName")} maxLength={64} />
            <input type="time" value={preset.start} onChange={(event) => update(preset.id, { start: event.target.value })} className={`${dbInputClass} !w-[124px] min-h-9 py-1.5`} aria-label={t("shifts.presetStart")} />
            <span className="text-[#9a9a96]">–</span>
            <input type="time" value={preset.end} onChange={(event) => update(preset.id, { end: event.target.value })} className={`${dbInputClass} !w-[124px] min-h-9 py-1.5`} aria-label={t("shifts.presetEnd")} />
            <select value={preset.pause} onChange={(event) => update(preset.id, { pause: event.target.value })} className={`${dbInputClass} !w-[120px] min-h-9 cursor-pointer py-1.5`} aria-label={t("shifts.presetPause")}>
              {["0m", "15m", "30m", "45m", "60m"].map((pause) => (
                <option key={pause} value={pause}>
                  {t("shifts.pauseOption", { minutes: Number.parseInt(pause, 10) })}
                </option>
              ))}
            </select>
            <span className="text-[12.5px] text-[#6e6e6b]">
              {t("shifts.net", { hours: (presetNetMinutes(preset) / 60).toLocaleString(locale, { maximumFractionDigits: 2 }) })}
            </span>
            <button
              type="button"
              aria-label={t("shifts.removePreset")}
              onClick={() => {
                setPresets((current) => current.filter((item) => item.id !== preset.id));
                markDirty();
              }}
              className="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-[#6e6e6b] hover:bg-[#f2f1ed]"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setPresets((current) => [...current, { id: `preset-${Date.now().toString(36)}`, label: t("shifts.newPreset"), start: "08:00", end: "16:00", pause: "30m", color: DEFAULT_SHIFT_PRESET_COLOR }]);
            markDirty();
          }}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13.5px] font-semibold text-[#6b4fc4]"
        >
          <Plus size={15} />
          {t("shifts.addPreset")}
        </button>
      </div>
    </SettingsCard>
  );
}

function HolidaysCard({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  return <SettingsForm action={saveHolidayRegionsSectionAction} hidden={{ tenant: data.tenant.slug }}>
    <SettingsCard title={t("shifts.holidays")} subtitle={t("shifts.holidaysHint")}>
      {data.locations.length === 0 && <p className="py-3 text-[13px] text-muted-2">{t("company.noLocations")}</p>}
      {data.locations.map((location) => <SettingsRow key={location.id} label={location.name}>
        <select name={`region:${location.id}`} defaultValue={location.bundesland ?? ""} aria-label={t("shifts.holidayRegion", { name: location.name })} className={`${dbInputClass} cursor-pointer`}>
          <option value="">{t("shifts.nationwide")}</option>
          {BUNDESLAENDER.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
        </select>
      </SettingsRow>)}
    </SettingsCard>
  </SettingsForm>;
}

// ---------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------

const DIGEST_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function parseDigest(value: string) {
  if (!value || value === "disabled") return { enabled: false, weekday: "monday", time: "08:00" };

  const [weekday, hhmm = "0800"] = value.split("-");

  return { enabled: true, weekday: DIGEST_DAYS.includes(weekday) ? weekday : "monday", time: `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}` };
}

function NotificationsPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const s = data.settings;

  if (!s) return null;

  const digest = parseDigest(s.digestTime);

  return (
    <SettingsForm action={saveSettingsSectionAction} hidden={{ tenant: data.tenant.slug, category: "notifications" }}>
      <SettingsCard title={t("notify.channels")} subtitle={t("notify.channelsHint")}>
        <SettingsRow label={t("notify.mail")} hint={t("notify.mailHint")}>
          <SettingSwitch name="mailNotifications" defaultChecked={s.mailNotifications} label={t("notify.mail")} />
        </SettingsRow>
        <SettingsRow label={t("notify.inApp")} hint={t("notify.inAppHint")}>
          <SettingSwitch name="inAppNotifications" defaultChecked={s.inAppNotifications} label={t("notify.inApp")} />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={t("notify.events")}>
        <SettingsRow label={t("notify.deadlines")} hint={t("notify.deadlinesHint")}>
          <SettingSwitch name="deadlineAlerts" defaultChecked={s.deadlineAlerts} label={t("notify.deadlines")} />
        </SettingsRow>
        <SettingsRow label={t("notify.absences")} hint={t("notify.absencesHint")}>
          <SettingSwitch name="absenceAlerts" defaultChecked={s.absenceAlerts} label={t("notify.absences")} />
        </SettingsRow>
        <SettingsRow label={t("notify.shifts")} hint={t("notify.shiftsHint")}>
          <SettingSwitch name="shiftAlerts" defaultChecked={s.shiftAlerts} label={t("notify.shifts")} />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={t("notify.digest")} subtitle={t("notify.digestHint")}>
        <SettingsRow label={t("notify.digestEnabled")}>
          <SettingSwitch name="digestEnabled" defaultChecked={digest.enabled} label={t("notify.digestEnabled")} />
        </SettingsRow>
        <SettingsRow label={t("notify.digestWhen")}>
          <span className="grid grid-cols-2 gap-2">
            <select name="digestWeekday" defaultValue={digest.weekday} className={`${dbInputClass} cursor-pointer`} aria-label={t("notify.digestDay")}>
              {DIGEST_DAYS.map((day) => (
                <option key={day} value={day}>
                  {t(`weekday.${day}`)}
                </option>
              ))}
            </select>
            <input name="digestTimeOfDay" type="time" defaultValue={digest.time} className={dbInputClass} aria-label={t("notify.digestTime")} />
          </span>
        </SettingsRow>
      </SettingsCard>
    </SettingsForm>
  );
}

// ---------------------------------------------------------------------------
// Abrechnung
// ---------------------------------------------------------------------------

type Invoice = { id: string; number: string | null; createdAt: string; amountDue: number; currency: string; hostedInvoiceUrl: string | null; invoicePdf: string | null };

function BillingPanel({ data }: { data: SettingsPageData }) {
  const t = useTranslations("SettingsPage");
  const locale = useLocale();
  const datePreference = useDatePreference();
  const dateLabel = preferredDateFormatter(datePreference, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const router = useRouter();
  const [, portalAction] = useActionStateWithToast(openBillingPortalAction);
  const [, checkoutAction] = useActionStateWithToast(startBillingCheckoutAction);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const healthy = data.tenant.stripeSubscriptionStatus === "active" || data.tenant.stripeSubscriptionStatus === "trialing";
  const plan = data.tenant.plan ?? "professional";
  const cycle = data.tenant.billingCycle ?? "monthly";
  const returnPath = `/u/${data.tenant.slug}/einstellungen?kat=billing`;
  const periodEnd = data.tenant.stripeCurrentPeriodEnd ? dateLabel.format(new Date(data.tenant.stripeCurrentPeriodEnd)) : null;
  const limit = data.usage.employeeLimit;
  const usedPercent = limit ? Math.min(100, (data.usage.activeEmployees / limit) * 100) : 0;
  const money = useMemo(() => (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100), [locale]);

  useEffect(() => {
    if (!data.stripeConfigured) return;

    let cancelled = false;

    fetch(`/api/tenants/${data.tenant.slug}/billing/invoices`)
      .then((response) => (response.ok ? response.json() : { invoices: [] }))
      .then((result: { invoices?: Invoice[] }) => {
        if (!cancelled) setInvoices(result.invoices ?? []);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      });

    return () => {
      cancelled = true;
    };
  }, [data.stripeConfigured, data.tenant.slug]);

  return (
    <>
      <SettingsCard title={t("billing.subscription")}>
        <div className="py-3.5">
          <div className="flex flex-wrap items-center gap-4 rounded-[14px] bg-ink px-5 py-4 text-white shadow-[0_12px_32px_rgba(107,79,196,0.25)]">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.12em] text-[#b9a8ef] uppercase">{t("billing.activePlan")}</span>
              <span className="font-display text-[22px] font-semibold">
                {t(`billing.plan.${plan}`)} <span className="font-sans text-[13px] font-normal text-white/70">{t(`billing.cycle.${cycle}`)}</span>
              </span>
              <span className="text-[13px] text-white/75">
                {!data.stripeConfigured
                  ? t("billing.notConfigured")
                  : healthy
                    ? periodEnd
                      ? data.tenant.stripeCancelAtPeriodEnd
                        ? t("billing.endsOn", { date: periodEnd })
                        : t("billing.renewsOn", { date: periodEnd })
                      : t("billing.active")
                    : t("billing.noSubscription")}
              </span>
            </div>
            {data.stripeConfigured && healthy && (
              <form action={portalAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="tenant" value={data.tenant.slug} />
                <input type="hidden" name="returnPath" value={returnPath} />
        <input type="hidden" name="paymentInterval" value={cycle} />
                <button type="submit" name="portalIntent" value="switch-plan" className="cursor-pointer rounded-[9px] border border-white/20 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white">
                  {t("billing.changePlan")}
                </button>
                <button type="submit" className="cursor-pointer rounded-[9px] border border-white/20 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white">
                  {t("billing.managePayment")}
                </button>
              </form>
            )}
          </div>
        </div>

        {(!data.stripeConfigured || !healthy) && (
          <SettingsPlanForm data={data} checkoutAction={checkoutAction} returnPath={returnPath} onSaved={() => router.refresh()} />
        )}
      </SettingsCard>

      <SettingsCard title={t("billing.usage")}>
        <div className="flex flex-col gap-2 py-3.5">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold">
              {limit ? t("billing.usedOf", { used: data.usage.activeEmployees, limit }) : t("billing.used", { used: data.usage.activeEmployees })}
            </span>
            {limit && <span className="text-[13px] text-[#6e6e6b]">{t("billing.free", { count: Math.max(0, limit - data.usage.activeEmployees), plan: t(`billing.plan.${plan}`) })}</span>}
          </span>
          {limit && (
            <span className="h-2 overflow-hidden rounded-full bg-[#f0efeb]">
              <span className="block h-full rounded-full bg-[#8b6fe0]" style={{ width: `${usedPercent}%` }} />
            </span>
          )}
          <span className="text-[12.5px] text-[#6e6e6b]">{t("billing.records", { count: data.usage.employeeTotal })}</span>
        </div>
      </SettingsCard>

      {data.stripeConfigured && (
        <SettingsCard title={t("billing.invoices")}>
          {invoices === null ? (
            <p className="m-0 py-3.5 text-[13px] text-[#6e6e6b]">{t("billing.invoicesLoading")}</p>
          ) : invoices.length === 0 ? (
            <p className="m-0 py-3.5 text-[13px] text-[#6e6e6b]">{t("billing.invoicesEmpty")}</p>
          ) : (
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                  <th className="py-2.5 text-left font-normal">{t("billing.invoice")}</th>
                  <th className="py-2.5 text-left font-normal">{t("billing.date")}</th>
                  <th className="py-2.5 text-right font-normal">{t("billing.amount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-[#f0efeb]">
                    <td className="py-2.5 font-mono text-[12.5px]">{invoice.number ?? invoice.id}</td>
                    <td className="py-2.5 text-[#6e6e6b]">{dateLabel.format(new Date(invoice.createdAt))}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{money(invoice.amountDue, invoice.currency)}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {invoice.hostedInvoiceUrl && (
                        <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="mr-2 font-semibold text-[#6b4fc4] underline">
                          {t("billing.view")}
                        </a>
                      )}
                      {invoice.invoicePdf && (
                        <a href={invoice.invoicePdf} target="_blank" rel="noreferrer" className={`${smallActionClass} min-h-7 bg-white px-2 py-0.5 text-[12px]`}>
                          PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SettingsCard>
      )}
    </>
  );
}

/** Ohne Stripe: Plan direkt speichern (wie bisher). Mit Stripe, aber ohne Abo: Checkout starten. */
function SettingsPlanForm({
  data,
  checkoutAction,
  returnPath,
  onSaved,
}: {
  data: SettingsPageData;
  checkoutAction: (formData: FormData) => void;
  returnPath: string;
  onSaved: () => void;
}) {
  const t = useTranslations("SettingsPage");
  const plan = data.tenant.plan ?? "professional";
  const cycle = data.tenant.billingCycle ?? "monthly";
  const planOptions = ["starter", "professional", "business"].map((value) => ({ value, label: t(`billing.plan.${value}`) }));


  if (data.stripeConfigured) {
    return (
      <form action={checkoutAction} className="flex flex-col">
        <input type="hidden" name="tenant" value={data.tenant.slug} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <input type="hidden" name="paymentInterval" value={cycle} />
        <SettingsRow label={t("billing.planLabel")}>
          <select name="planSelection" defaultValue={plan} className={`${dbInputClass} cursor-pointer`} aria-label={t("billing.planLabel")}>
            {planOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingsRow>
        <div className="flex justify-end py-3.5">
          <button type="submit" className={ctaClass}>
            {t("billing.subscribe")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <SettingsForm
      action={saveSettingsSectionAction}
      onSaved={onSaved}
      className="flex flex-col"
      hidden={{
        tenant: data.tenant.slug,
        category: "billing",
        paymentInterval: cycle,
        companyName: data.tenant.name,
        tenantId: data.tenant.slug,
        country: data.tenant.country ?? "DE",
        timezone: data.tenant.timezone ?? "Europe/Berlin",
        size: data.tenant.size,
        industry: data.tenant.industry,
        logoUrl: data.tenant.logoUrl,
        primaryColor: data.tenant.primaryColor ?? "#2A6FDB",
      }}
    >
      <SettingsRow label={t("billing.planLabel")}>
        <select name="planSelection" defaultValue={plan} className={`${dbInputClass} cursor-pointer`} aria-label={t("billing.planLabel")}>
          {planOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsRow label={t("billing.receiptEmail")} hint={t("billing.receiptEmailHint")}>
        <input name="receiptEmail" type="email" defaultValue={data.tenant.contactEmail} className={dbInputClass} aria-label={t("billing.receiptEmail")} />
      </SettingsRow>
    </SettingsForm>
  );
}

// ---------------------------------------------------------------------------
// Integrationen
// ---------------------------------------------------------------------------

function IntegrationsPanel() {
  const t = useTranslations("SettingsPage");

  return (
    <SettingsCard title={t("integrations.title")} subtitle={t("integrations.hint")}>
      {(["payroll", "calendar", "api", "documents"] as const).map((item) => (
        <SettingsRow key={item} label={t(`integrations.${item}`)} hint={t(`integrations.${item}Hint`)} badge={<SoonBadge />}>
        </SettingsRow>
      ))}
    </SettingsCard>
  );
}

