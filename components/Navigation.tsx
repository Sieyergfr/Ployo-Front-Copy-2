"use client";

import { Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type NavItem = {
  label: string;
  code: string;
  href: string;
  count?: string;
  tone?: "default" | "danger";
};

type TenantItem = {
  name: string;
  role: string;
  mark: string;
  href: string;
  colorClass: string;
};

const navigationItems: NavItem[] = [
  { label: "Übersicht", code: "Üb", href: "" },
  { label: "Mitarbeiter", code: "MA", href: "/employees", count: "247" },
  { label: "Standorte", code: "St", href: "/standorte", count: "3" },
  { label: "Teams", code: "Tm", href: "/teams", count: "4" },
  { label: "Dateien", code: "Dt", href: "/dateien" },
  { label: "Urlaub", code: "Ur", href: "/urlaub", count: "8" },
  { label: "Krankheit", code: "Kr", href: "/krankheit" },
  { label: "Schichtplanung", code: "Sp", href: "/schichtplanung", count: "3", tone: "danger" },
  { label: "Erinnerungen", code: "Er", href: "/erinnerungen", count: "5" },
];

const tenantItems: TenantItem[] = [
  {
    name: "M\u00fcller & Partner GmbH",
    role: "HR-Leitung",
    mark: "M",
    href: "/u/mueller-partner",
    colorClass: "sidebar-tenant-mark-blue",
  },
  {
    name: "Technik Solutions AG",
    role: "Lohnbuchhalterin",
    mark: "T",
    href: "/u/technik-solutions",
    colorClass: "sidebar-tenant-mark-green",
  },
  {
    name: "Nord Logistik GmbH",
    role: "HR-Referentin",
    mark: "N",
    href: "/u/nord-logistik",
    colorClass: "sidebar-tenant-mark-purple",
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function NavigationSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const tenantSelectorRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useParams<{ tenant?: string | string[] }>();

  const tenant = Array.isArray(params.tenant) ? params.tenant[0] : params.tenant;
  const baseHref = tenant ? `/u/${tenant}` : "/u";
  const toggleLabel = isCollapsed ? "Navigation ausklappen" : "Navigation einklappen";
  const activeTenant =
    tenantItems.find((item) => item.href === baseHref) ?? tenantItems[0];

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
              <>
                <span className="sidebar-link-label">{item.label}</span>
                {item.count && (
                  <span
                    className={cx(
                      "sidebar-link-count",
                      item.tone === "danger" && "sidebar-link-count-danger",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </>
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

        <Link
          href={`${baseHref}/einstellungen`}
          title="Einstellungen"
          className="sidebar-link"
        >
          <span className="sidebar-link-code">Eg</span>
          {!isCollapsed && <span className="sidebar-link-label">Einstellungen</span>}
        </Link>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" title="Carla Brandt - HR-Leitung">
            CB
          </div>

          {!isCollapsed && (
            <div className="sidebar-user-copy">
              <div className="sidebar-user-name">Carla Brandt</div>
              <div className="sidebar-user-role">HR-Leitung</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
