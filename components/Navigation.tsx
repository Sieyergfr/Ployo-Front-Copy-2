"use client";

import { switchLanguageAction } from "@/app/(dashboard)/konto/actions";
import { useActionStateWithToast } from "@/components/Toasts";
import { permissionLevels, type PermissionLevel } from "@/lib/roles";
import type { TenantPermissionArea } from "@/lib/tenant-access";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {   useEffect, useMemo, useRef, useState } from "react";

const availableLocales = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
] as const;

import type {
  NavigationTenantItem,
  NavigationUsageInfo,
  NavigationUserItem,
} from "@/components/navigation/types";
import TenantSettingsDialog from "@/components/navigation/TenantSettingsDialog";

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

type TenantItem = NavigationTenantItem;

export type { NavigationTenantItem, NavigationUsageInfo, NavigationUserItem };

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

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: string;
};

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
        <TenantSettingsDialog
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
