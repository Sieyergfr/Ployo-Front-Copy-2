import type { AddressInput } from "@/lib/address";
import type { PermissionLevel } from "@/lib/roles";
import type { TenantPermissionArea } from "@/lib/tenant-access";

/** Mandant in der Seitenleiste inkl. Rechte und Einstellungen (Server → Client). */
export type NavigationTenantItem = {
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
    timeTrackingQrRequiredClockOut: boolean;
  };
};

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
