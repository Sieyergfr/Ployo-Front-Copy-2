"use client";

import { switchLanguageAction } from "@/app/(dashboard)/konto/actions";
import TrialBanner from "@/components/navigation/TrialBanner";
import { useActionStateWithToast } from "@/components/Toasts";
import { permissionLevels, type PermissionLevel } from "@/lib/roles";
import type { TenantPermissionArea } from "@/lib/tenant-access";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  CalendarDays,
  ChartColumn,
  ScrollText,
  Check,
  CheckCheck,
  ChevronsUpDown,
  CircleAlert,
  CircleUserRound,
  Clock,
  Contact,
  CreditCard,
  KeyRound,
  UserX,
  Folder,
  LayoutDashboard,
  LogOut,
  FileText,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Thermometer,
  Timer,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  NavigationTenantItem,
  NavigationUsageInfo,
  NavigationUserItem,
} from "@/components/navigation/types";

const availableLocales = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
] as const;

type NavSection = "personal" | "staff" | "organisation" | "analysis";

type NavItem = {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  section: NavSection;
  area?: TenantPermissionArea;
  requiredLevel?: PermissionLevel;
  /** Nur anzeigen, wenn der Mandant die Zeiterfassung aktiviert hat. */
  requiresTimeTracking?: boolean;
  badge?: "vacation" | "sickness";
};

// Reihenfolge und Gruppen wie im Design; Rechte wie bisher.
const navigationItems: NavItem[] = [
  { labelKey: "overview", icon: LayoutDashboard, href: "", section: "personal" },
  { labelKey: "myArea", icon: CircleUserRound, href: "/mein-bereich", section: "personal" },
  { labelKey: "myTimes", icon: Clock, href: "/zeiten", section: "personal", requiresTimeTracking: true },
  { labelKey: "employees", icon: Contact, href: "/employees", section: "staff", area: "employees" },
  { labelKey: "shifts", icon: CalendarDays, href: "/schichtplanung", section: "staff", area: "shifts" },
  {
    labelKey: "timeTracking",
    icon: Timer,
    href: "/zeiterfassung",
    section: "staff",
    area: "timeTracking",
    requiresTimeTracking: true,
  },
  { labelKey: "vacation", icon: Sun, href: "/urlaub", section: "staff", area: "vacation", badge: "vacation" },
  { labelKey: "sickness", icon: Thermometer, href: "/krankheit", section: "staff", area: "sickness", badge: "sickness" },
  { labelKey: "files", icon: Folder, href: "/dateien", section: "staff", area: "files" },
  { labelKey: "locations", icon: MapPin, href: "/standorte", section: "organisation", area: "locations" },
  { labelKey: "teams", icon: Users, href: "/teams", section: "organisation", area: "teams" },
  { labelKey: "roles", icon: Shield, href: "/rollen", section: "organisation", area: "roles", requiredLevel: "admin" },
  { labelKey: "reports", icon: ChartColumn, href: "/reports", section: "analysis", area: "timeTracking" },
  { labelKey: "reminders", icon: AlarmClock, href: "/erinnerungen", section: "analysis", area: "reminders" },
  { labelKey: "audit", icon: ScrollText, href: "/audit", section: "analysis", area: "audit" },
];

const sections: NavSection[] = ["personal", "staff", "organisation", "analysis"];

function hasRequiredLevel(actual: PermissionLevel, required: PermissionLevel) {
  return permissionLevels.indexOf(actual) >= permissionLevels.indexOf(required);
}

function tenantSlugFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return segments[0] === "u" ? segments[1] : undefined;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: string;
};

type NavigationCounts = {
  pendingVacations: number | null;
  activeSickness: number | null;
};

type NavigationFetchedData = {
  tenant: string;
  notifications: NotificationItem[];
  usage: NavigationUsageInfo | null;
  counts: NavigationCounts | null;
};

/** Geteilt zwischen dem Mandanten-Mount-Fetch und dem Öffnen-der-Glocke-Refetch (QA-Bug BUG-019). */
function fetchNavigationNotifications(
  tenant: string,
  onData: (data: NavigationFetchedData) => void,
) {
  fetch(`/api/me/notifications?tenant=${encodeURIComponent(tenant)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then(
      (
        data: {
          notifications?: NotificationItem[];
          usage?: NavigationUsageInfo | null;
          counts?: NavigationCounts | null;
        } | null,
      ) => {
        if (data) {
          onData({
            tenant,
            notifications: data.notifications ?? [],
            usage: data.usage ?? null,
            counts: data.counts ?? null,
          });
        }
      },
    )
    .catch(() => {});
}

// Die IDs aus /api/me/notifications tragen ihren Bereich als Präfix.
const notificationKinds = {
  vacation: { icon: Sun, tone: "#168a8a", href: "/urlaub" },
  reminder: { icon: CircleAlert, tone: "#e07b00", href: "/erinnerungen" },
  shifts: { icon: CalendarDays, tone: "#8b6ed4", href: "/schichtplanung" },
  access: { icon: KeyRound, tone: "#6b4fc4", href: "/rollen" },
  billing: { icon: CreditCard, tone: "#b4332a", href: "/einstellungen?kat=billing" },
  invitation: { icon: UserX, tone: "#6e6e6b", href: "/employees" },
} as const;

function notificationKind(id: string) {
  const prefix = id.split("-")[0] as keyof typeof notificationKinds;

  return notificationKinds[prefix] ?? notificationKinds.reminder;
}

type NotificationTab = "all" | "unread" | "requests";

function NotificationsPanel({
  notifications,
  readNotificationIds,
  baseHref,
  isCollapsed,
  onClose,
  onMarkAsRead,
  onOpenSettings,
}: {
  notifications: NotificationItem[];
  readNotificationIds: string[];
  baseHref: string;
  isCollapsed: boolean;
  onClose: () => void;
  onMarkAsRead: (ids: string[]) => void;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("Navigation.notificationsPopup");
  const [tab, setTab] = useState<NotificationTab>("all");
  const isUnread = (notification: NotificationItem) =>
    !readNotificationIds.includes(notification.id);
  // Offene Anträge, die eine Entscheidung brauchen.
  const isRequest = (notification: NotificationItem) =>
    notification.id.startsWith("vacation-");
  const unread = notifications.filter(isUnread);
  const requests = notifications.filter(isRequest);
  const visible =
    tab === "unread" ? unread : tab === "requests" ? requests : notifications;
  const tabs: Array<{ id: NotificationTab; label: string; count: number }> = [
    { id: "all", label: t("tabs.all"), count: 0 },
    { id: "unread", label: t("tabs.unread"), count: unread.length },
    { id: "requests", label: t("tabs.requests"), count: requests.length },
  ];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[49]" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-label={t("title")}
        className="db-pop-light db-notif-pop fixed bottom-3 z-50 flex max-h-[calc(100dvh-24px)] w-[392px] flex-col overflow-hidden rounded-[18px] bg-white/[0.97] text-ink backdrop-blur-[18px]"
        style={{ left: isCollapsed ? 88 : 276 }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[110px] -left-[60px] h-[220px] w-[320px] bg-[radial-gradient(closest-side,rgba(139,110,212,0.22),transparent)]"
        />

        <div className="relative flex shrink-0 items-center justify-between gap-3 pt-[18px] pr-4 pb-3 pl-5">
          <span className="flex items-center gap-2.5">
            <span className="font-display text-[18px] font-semibold tracking-[-0.4px]">
              {t("title")}
            </span>
            {unread.length > 0 && (
              <span className="rounded-full bg-[#8b6ed4] px-2 py-0.5 text-[11.5px] font-semibold text-white shadow-[0_0_12px_rgba(139,110,212,0.55)]">
                {t("newCount", { count: unread.length })}
              </span>
            )}
          </span>
          <span className="flex gap-0.5">
            <button
              type="button"
              title={t("markAllRead")}
              aria-label={t("markAllRead")}
              disabled={unread.length === 0}
              className="db-nbtn db-focus flex size-[34px] cursor-pointer items-center justify-center rounded-[9px] text-[#6e6e6b] disabled:cursor-default disabled:opacity-50"
              onClick={() => onMarkAsRead(unread.map((notification) => notification.id))}
            >
              <CheckCheck size={17} />
            </button>
            <button
              type="button"
              title={t("settings")}
              aria-label={t("settings")}
              className="db-nbtn db-focus flex size-[34px] cursor-pointer items-center justify-center rounded-[9px] text-[#6e6e6b]"
              onClick={onOpenSettings}
            >
              <SlidersHorizontal size={16} />
            </button>
          </span>
        </div>

        <div
          role="tablist"
          aria-label={t("filterLabel")}
          className="relative mx-4 mb-1.5 flex shrink-0 gap-1 rounded-[10px] bg-[#f2f1ed] p-[3px]"
        >
          {tabs.map((item) => {
            const isActive = tab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cx(
                  "db-focus inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] px-2 py-[7px] text-[12.5px] font-medium",
                  isActive
                    ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08),0_4px_12px_-4px_rgba(139,110,212,0.4)]"
                    : "text-[#6e6e6b]",
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.count > 0 && (
                  <span
                    className={cx(
                      "text-[11px] tabular-nums",
                      isActive ? "text-[#8b6ed4]" : "text-[#9a9a96]",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="db-nlist relative min-h-0 flex-auto overflow-y-auto px-2 pt-1 pb-2.5">
          {visible.map((notification) => {
            const kind = notificationKind(notification.id);
            const Icon = kind.icon;
            const unreadItem = isUnread(notification);

            return (
              <Link
                key={notification.id}
                href={`${baseHref}${kind.href}`}
                className={cx(
                  "db-nitem db-focus relative flex gap-3 rounded-[12px] p-3 no-underline",
                  unreadItem ? "bg-[rgba(139,110,212,0.06)]" : "bg-transparent",
                )}
                onClick={() => {
                  onMarkAsRead([notification.id]);
                  onClose();
                }}
              >
                {unreadItem && (
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-full bg-[#8b6ed4] shadow-[0_0_10px_rgba(139,110,212,0.8)]"
                  />
                )}
                <span className="relative size-[38px] shrink-0">
                  <span className="flex size-[38px] items-center justify-center rounded-[11px] bg-ink shadow-[0_6px_16px_-8px_rgba(139,110,212,0.9)]">
                    <Image
                      src="/logo_square_white.svg"
                      alt=""
                      width={19}
                      height={19}
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full shadow-[0_0_0_2.5px_#ffffff]"
                    style={{ background: kind.tone }}
                  >
                    <Icon size={11} strokeWidth={2.6} color="#ffffff" />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[13.5px] leading-[1.4] font-semibold text-ink">
                      {notification.title}
                    </span>
                    <span className="shrink-0 text-[11.5px] whitespace-nowrap text-[#9a9a96]">
                      {notification.category}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-[#6e6e6b] tabular-nums">
                    {notification.detail}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-[#6b4fc4]">
                    {isRequest(notification) ? t("openRequest") : t("open")}
                    <ArrowRight size={13} strokeWidth={2.2} />
                  </span>
                </span>
              </Link>
            );
          })}

          {visible.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 px-5 pt-10 pb-9 text-center">
              <span className="flex size-[52px] items-center justify-center rounded-full bg-[rgba(139,110,212,0.12)] shadow-[0_0_0_8px_rgba(139,110,212,0.05),0_0_30px_rgba(139,110,212,0.35)]">
                <Check size={22} strokeWidth={2.2} color="#7a5fd0" />
              </span>
              <span className="font-display text-[16px] font-semibold tracking-[-0.3px]">
                {t("emptyTitle")}
              </span>
              <span className="text-[13px] text-[#6e6e6b]">
                {tab === "requests" ? t("emptyRequests") : t("emptyUnread")}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type SearchEntry = { label: string; href: string; icon: LucideIcon; subtitle?: string; group?: string };

type SearchApiResult = {
  kind: "employee" | "location" | "team" | "file";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const searchKindIcons: Record<SearchApiResult["kind"], LucideIcon> = {
  employee: UserRound,
  location: MapPin,
  team: Users,
  file: FileText,
};

/** Schnellsuche (⌘K): Seiten sofort, dazu Mitarbeiter, Standorte, Teams und Dateien vom Server. */
function SearchDialog({
  tenant,
  entries,
  onClose,
}: {
  tenant: string;
  entries: SearchEntry[];
  onClose: () => void;
}) {
  const t = useTranslations("Navigation.search");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState<{ query: string; results: SearchApiResult[] }>({ query: "", results: [] });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const pageResults = normalizedQuery
    ? entries.filter((entry) => entry.label.toLocaleLowerCase().includes(normalizedQuery))
    : entries;
  const remoteResults: SearchEntry[] =
    remote.query === query.trim()
      ? remote.results.map((result) => ({
          label: result.title,
          subtitle: result.subtitle,
          href: result.href,
          icon: searchKindIcons[result.kind],
          group: t(`group.${result.kind}`),
        }))
      : [];
  const results = [...pageResults.map((entry) => ({ ...entry, group: normalizedQuery ? t("group.pages") : undefined })), ...remoteResults];
  const searching = query.trim().length >= 2 && remote.query !== query.trim();

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2 || !tenant) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/tenants/${encodeURIComponent(tenant)}/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data: { results?: SearchApiResult[] }) => setRemote({ query: trimmed, results: data.results ?? [] }))
        .catch(() => undefined);
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tenant]);

  function open(entry: SearchEntry | undefined) {
    if (entry) {
      onClose();
      router.push(entry.href);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/35 px-4 pt-[12vh] backdrop-blur-[4px]"
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
        className="db-pop-light w-full max-w-[560px] overflow-hidden rounded-[16px] bg-white text-ink"
      >
        <div className="flex items-center gap-2.5 border-b border-[#ecebe7] px-4">
          <Search size={16} className="shrink-0 text-[#6e6e6b]" />
          <input
            autoFocus
            value={query}
            placeholder={t("inputPlaceholderAll")}
            aria-label={t("inputPlaceholderAll")}
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                open(results[activeIndex]);
              }
            }}
          />
          <span className="rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] text-[#8f8f8a] shadow-[inset_0_0_0_1px_#ecebe7]">
            Esc
          </span>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2" role="listbox" aria-label={t("dialogLabel")}>
          {results.map((entry, index) => {
            const Icon = entry.icon;
            const showGroup = entry.group && entry.group !== results[index - 1]?.group;

            return (
              <div key={`${entry.group ?? ""}-${entry.href}`}>
                {showGroup && (
                  <div className="px-3 pt-2.5 pb-1 font-mono text-[10px] tracking-[0.12em] text-[#9a9a96] uppercase">{entry.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px]",
                    index === activeIndex ? "bg-[#f2f1ed]" : "hover:bg-[#f5f4f1]",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => open(entry)}
                >
                  <Icon size={16} className="shrink-0 text-[#6e6e6b]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{entry.label}</span>
                    {entry.subtitle && <span className="truncate text-[12px] text-[#9a9a96]">{entry.subtitle}</span>}
                  </span>
                </button>
              </div>
            );
          })}
          {searching && <p className="px-3 py-2 text-[12.5px] text-[#9a9a96]">{t("searching")}</p>}
          {results.length === 0 && !searching && (
            <p className="px-3 py-6 text-center text-[13px] text-[#6e6e6b]">{t("empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Rahmen des Dashboards nach dem neuen Design: dunkle, einklappbare
 * Seitenleiste, Benachrichtigungs-Panel, mobile Kopfzeile und Inhaltsbereich.
 */
export default function DashboardShell({
  tenants = [],
  user,
  children,
}: {
  tenants?: NavigationTenantItem[];
  user?: NavigationUserItem;
  children: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  // Antwort inkl. Mandant, damit beim Mandantenwechsel nicht kurz die Daten
  // des vorherigen Mandanten stehen bleiben.
  const [fetchedData, setFetchedData] = useState<NavigationFetchedData | null>(null);
  const currentLocale = useLocale();
  const t = useTranslations("Navigation");
  const [, switchLanguageFormAction] = useActionStateWithToast(switchLanguageAction);
  const tenantSelectorRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ tenant?: string | string[] }>();

  const routeTenant = Array.isArray(params.tenant) ? params.tenant[0] : params.tenant;
  const tenant = routeTenant ?? tenantSlugFromPathname(pathname);
  const baseHref = tenant ? `/u/${tenant}` : "/u";
  const fallbackTenantItem: NavigationTenantItem = {
    name: t("tenant.selectCompany"),
    role: t("tenant.noCompanyActive"),
    mark: "U",
    href: "/select",
    color: "#2a6fdb",
  };
  const tenantItems = tenants.length > 0 ? tenants : [fallbackTenantItem];
  const isCurrentTenantData = Boolean(tenant) && fetchedData?.tenant === tenant;
  const notifications = isCurrentTenantData ? fetchedData!.notifications : [];
  const counts = isCurrentTenantData ? fetchedData!.counts : null;
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

  function badgeCount(badge: NavItem["badge"]) {
    if (badge === "vacation") {
      return counts?.pendingVacations ?? 0;
    }

    if (badge === "sickness") {
      return counts?.activeSickness ?? 0;
    }

    return 0;
  }

  function closeOverlays() {
    setIsTenantMenuOpen(false);
    setIsNotificationsOpen(false);
  }

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

  // Zusätzlich beim Öffnen der Glocke neu laden (QA-Bug BUG-019): eine
  // seither entstandene/entfernte Benachrichtigung soll den Badge-Stand nicht
  // bis zum nächsten Mandantenwechsel veralten lassen.
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
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((current) => !current);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const itemClass = (isActive = false) =>
    cx("db-item db-focus", isActive && "db-item-active", isCollapsed && "db-item-c");
  const bellLabel =
    unreadNotificationCount > 0
      ? t("user.unreadNotifications", { count: unreadNotificationCount })
      : t("user.notifications");

  return (
    <div className="fixed inset-0 flex w-full overflow-hidden bg-[#fafaf8] font-sans text-ink">
      {isMobileOpen && (
        <div className="db-scrim" aria-hidden="true" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside
        aria-label={t("sidebarLabel")}
        className={cx(
          "db-side relative flex h-dvh shrink-0 flex-col bg-[#0d0d0d] text-[#ededea]",
          isCollapsed ? "w-[76px]" : "w-[264px]",
          isMobileOpen && "db-side-open",
        )}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="db-side-glow" />
        </div>

        <div className="relative flex min-h-16 items-center justify-between gap-2 pt-5 pr-3.5 pb-3 pl-[18px]">
          <Link
            href={baseHref}
            aria-label="Ployo"
            className="db-focus flex min-w-0 items-center gap-2.5 rounded-[8px] text-white no-underline"
          >
            <Image
              src="/logo_square_white.svg"
              alt=""
              width={26}
              height={26}
              aria-hidden="true"
              className="shrink-0 drop-shadow-[0_0_12px_rgba(167,142,232,0.7)]"
            />
            {!isCollapsed && (
              <span className="font-display text-[19px] font-semibold tracking-[-0.4px] text-white">
                Ployo
              </span>
            )}
          </Link>
          {!isCollapsed && (
            <button
              type="button"
              className="db-icon-btn db-collapse db-focus flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[#8f8f8a]"
              aria-label={t("toggle.collapse")}
              title={t("toggle.collapse")}
              onClick={() => {
                closeOverlays();
                setIsCollapsed(true);
              }}
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="relative flex justify-center pb-2">
            <button
              type="button"
              className="db-icon-btn db-collapse db-focus flex h-8 w-10 cursor-pointer items-center justify-center rounded-[9px] text-[#8f8f8a]"
              aria-label={t("toggle.expand")}
              title={t("toggle.expand")}
              onClick={() => {
                closeOverlays();
                setIsCollapsed(false);
              }}
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        )}

        <div className="relative px-3 py-1">
          <button
            type="button"
            title={t("search.title")}
            className={cx(
              "db-search db-focus box-border flex min-h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[9px] bg-white/5 px-2.5 text-[13px] text-[#8f8f8a] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]",
              isCollapsed ? "justify-center" : "justify-start",
            )}
            onClick={() => {
              closeOverlays();
              setIsSearchOpen(true);
            }}
          >
            <Search size={15} className="shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">{t("search.placeholder")}</span>
                <span className="rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] text-[#8f8f8a] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
                  ⌘K
                </span>
              </>
            )}
          </button>
        </div>

        <nav
          aria-label={t("mainNavLabel")}
          className="db-nav-scroll relative flex min-h-0 flex-auto flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-3"
          onClick={() => setIsMobileOpen(false)}
        >
          {sections.map((section, sectionIndex) => {
            const sectionItems = items.filter((item) => item.section === section);

            if (sectionItems.length === 0) {
              return null;
            }

            return (
              <div key={section} className="flex flex-col gap-0.5">
                {isCollapsed ? (
                  sectionIndex === 0 ? (
                    <div className="h-2.5" />
                  ) : (
                    <div className="mx-2 my-2.5 h-px bg-white/[0.07]" />
                  )
                ) : (
                  <div className="db-sec">{t(`sections.${section}`)}</div>
                )}
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  const count = badgeCount(item.badge);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      aria-current={item.isActive ? "page" : undefined}
                      className={itemClass(item.isActive)}
                    >
                      <Icon size={17} />
                      {!isCollapsed && <span className="db-label">{item.label}</span>}
                      {!isCollapsed && count > 0 && (
                        <span
                          className={cx(
                            "db-count",
                            item.badge === "sickness"
                              ? "bg-[rgba(180,51,42,0.22)] text-[#ff9a92]"
                              : "bg-[rgba(224,123,0,0.18)] text-[#ffc27a]",
                          )}
                        >
                          {count}
                        </span>
                      )}
                      {isCollapsed && count > 0 && <span className="db-dot" />}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="relative flex flex-col gap-0.5 border-t border-white/[0.07] px-3 pt-2.5 pb-3.5">
          <div className="relative" ref={tenantSelectorRef}>
            <button
              type="button"
              title={t("tenant.switchTenant")}
              aria-haspopup="listbox"
              aria-expanded={isTenantMenuOpen}
              className={cx(
                "db-row db-focus box-border flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[10px] bg-white/[0.04] px-2 py-1.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]",
                isCollapsed ? "justify-center" : "justify-start",
              )}
              onClick={() => {
                setIsNotificationsOpen(false);
                setIsTenantMenuOpen((current) => !current);
              }}
            >
              <span
                className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] font-display text-[13px] font-bold text-white"
                style={{ background: activeTenant.color }}
              >
                {activeTenant.mark}
              </span>
              {!isCollapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold text-white">
                      {activeTenant.name}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.03em] text-[#8f8f8a] uppercase">
                      {activeTenant.role}
                    </span>
                  </span>
                  <ChevronsUpDown size={15} className="shrink-0 text-[#8f8f8a]" />
                </>
              )}
            </button>

            {isTenantMenuOpen && (
              <div
                role="listbox"
                aria-label={t("tenant.yourCompanies")}
                className="db-pop absolute bottom-[calc(100%+8px)] left-0 z-20 box-border w-[max(100%,256px)] rounded-[12px] bg-[#1a1a19] p-1.5"
              >
                <div className="px-2.5 pt-2 pb-1.5 font-mono text-[10px] tracking-[0.12em] text-[#8f8f8a] uppercase">
                  {t("tenant.yourCompanies")}
                </div>
                {tenantItems.map((item) => {
                  const isActive = item.href === activeTenant.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="option"
                      aria-selected={isActive}
                      className="db-row db-focus flex min-h-11 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left no-underline"
                      onClick={() => {
                        setIsTenantMenuOpen(false);
                        setIsMobileOpen(false);
                      }}
                    >
                      <span
                        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] font-display text-[12px] font-bold text-white"
                        style={{ background: item.color }}
                      >
                        {item.mark}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[13px] font-medium text-[#ededea]">
                          {item.name}
                        </span>
                        <span className="text-[11.5px] text-[#8f8f8a]">{item.role}</span>
                      </span>
                      {isActive && <Check size={15} strokeWidth={2.5} color="#c9b8f5" />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-1.5" />
          <Link
            href={`${baseHref}/einstellungen`}
            title={t("footer.settings")}
            aria-current={pathname.startsWith(`${baseHref}/einstellungen`) ? "page" : undefined}
            className={itemClass(pathname.startsWith(`${baseHref}/einstellungen`))}
            onClick={() => closeOverlays()}
          >
            <Settings size={17} />
            {!isCollapsed && <span className="db-label">{t("footer.settings")}</span>}
          </Link>
          <form action="/logout" method="post">
            <button type="submit" title={t("footer.logout")} className={itemClass()}>
              <LogOut size={17} />
              {!isCollapsed && <span className="db-label">{t("footer.logout")}</span>}
            </button>
          </form>

          <div className="mx-1 my-2 h-px bg-white/[0.07]" />

          <div
            className={cx(
              "relative flex items-center gap-2.5 pt-1 pr-0.5 pl-1",
              isCollapsed ? "flex-col justify-center" : "flex-row justify-start",
            )}
          >
            <span
              className="relative flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#c9622a] font-display text-[14px] font-bold tracking-[-0.3px] text-white"
              title={user ? `${user.name} - ${activeTenant.role}` : undefined}
            >
              {user?.initials ?? "–"}
            </span>
            {!isCollapsed && (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-white">
                  {user?.name ?? t("user.signedIn")}
                </span>
                <span className="flex items-center gap-2 text-[11.5px] text-[#8f8f8a]">
                  {activeTenant.role}
                  {availableLocales.map((locale) => (
                    <form key={locale.code} action={switchLanguageFormAction}>
                      <input type="hidden" name="redirectTo" value={pathname} />
                      <input type="hidden" name="language" value={locale.code} />
                      <button
                        type="submit"
                        disabled={currentLocale === locale.code}
                        title={locale.code === "de" ? t("footer.localeDe") : t("footer.localeEn")}
                        className={cx(
                          "cursor-pointer rounded-[5px] px-1 font-mono text-[10px] uppercase transition-colors disabled:cursor-default",
                          currentLocale === locale.code
                            ? "bg-white/10 text-white"
                            : "hover:text-white",
                        )}
                      >
                        {locale.label}
                      </button>
                    </form>
                  ))}
                </span>
              </span>
            )}
            <button
              type="button"
              aria-label={bellLabel}
              title={t("user.notifications")}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              className={cx(
                "db-icon-btn db-focus relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[#ededea]",
                isNotificationsOpen ? "bg-white/10" : "bg-transparent",
              )}
              onClick={() => {
                setIsTenantMenuOpen(false);
                setIsMobileOpen(false);
                setIsNotificationsOpen((current) => !current);
              }}
            >
              <Bell size={17} />
              {unreadNotificationCount > 0 && (
                <span className="absolute top-1 right-1 box-border h-4 min-w-4 rounded-full bg-[#8b6ed4] px-1 text-center text-[10px] leading-4 font-bold text-white shadow-[0_0_0_2px_#0d0d0d,0_0_10px_rgba(167,142,232,0.9)]">
                  {unreadNotificationCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content relative">
        <div className="db-main-glow" aria-hidden="true" />

        <div className="db-topbar sticky top-0 z-[2] items-center justify-between gap-3 border-b border-[#ecebe7] bg-white/70 px-4 py-3 backdrop-blur-[14px]">
          <button
            type="button"
            aria-label={t("toggle.mobileOpen")}
            aria-expanded={isMobileOpen}
            className="db-icon-btn-l db-focus flex size-11 cursor-pointer items-center justify-center rounded-[10px]"
            onClick={() => {
              setIsNotificationsOpen(false);
              setIsMobileOpen(true);
            }}
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2">
            <Image src="/logo_square_brand.svg" alt="" width={22} height={22} aria-hidden="true" />
            <span className="font-display text-[18px] font-semibold tracking-[-0.4px]">Ployo</span>
          </span>
          <button
            type="button"
            aria-label={bellLabel}
            className="db-icon-btn-l db-focus relative flex size-11 cursor-pointer items-center justify-center rounded-[10px]"
            onClick={() => setIsNotificationsOpen((current) => !current)}
          >
            <Bell size={19} />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-[#8b6ed4]" />
            )}
          </button>
        </div>

        <div className="container relative z-[1]">
          {activeTenant.stripeSubscriptionStatus === "trialing" &&
            activeTenant.stripeCurrentPeriodEnd &&
            activeTenant.slug &&
            (activeTenant.permissions?.settings === "write" || activeTenant.permissions?.settings === "admin") && (
              <TrialBanner key={activeTenant.slug} tenantSlug={activeTenant.slug} trialEnd={activeTenant.stripeCurrentPeriodEnd} />
            )}
          {children}
        </div>
      </main>

      {isNotificationsOpen && (
        <NotificationsPanel
          notifications={notifications}
          readNotificationIds={readNotificationIds}
          baseHref={baseHref}
          isCollapsed={isCollapsed}
          onClose={() => setIsNotificationsOpen(false)}
          onMarkAsRead={(ids) => {
            setReadNotificationIds((current) => Array.from(new Set([...current, ...ids])));
          }}
          onOpenSettings={() => {
            setIsNotificationsOpen(false);
            router.push(`${baseHref}/einstellungen?kat=notifications`);
          }}
        />
      )}

      {isSearchOpen && (
        <SearchDialog
          tenant={tenant ?? ""}
          entries={items.map((item) => ({ label: item.label, href: item.href, icon: item.icon }))}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

    </div>
  );
}
