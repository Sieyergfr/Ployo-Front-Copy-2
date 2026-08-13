import { describe, expect, it } from "vitest";
import { canAccessFileAcl, type FileAclRecord } from "@/lib/file-access";
import type { TenantAccess } from "@/lib/tenant-access";

function access(overrides: Partial<TenantAccess> = {}): TenantAccess {
  return {
    tenantId: "tenant-1",
    tenantSlug: "acme",
    userId: "user-1",
    userName: "Test",
    membershipRole: "EMPLOYEE",
    roleId: null,
    area: "files",
    permissionLevel: "read",
    scope: "all",
    canDelete: false,
    canUploadFiles: false,
    canEditFiles: false,
    canViewFiles: false,
    canViewAudit: false,
    shiftsLevel: null,
    ...overrides,
  };
}

function file(overrides: Partial<FileAclRecord> = {}): FileAclRecord {
  return {
    accessRoleIdsJson: [],
    accessUserIdsJson: [],
    ...overrides,
  };
}

describe("canAccessFileAcl", () => {
  it("erlaubt Zugriff, wenn keine ACL gesetzt ist", () => {
    expect(canAccessFileAcl(file(), access())).toBe(true);
  });

  it("erlaubt Mandanten-Verwaltern immer Zugriff", () => {
    const restricted = file({ accessUserIdsJson: ["someone-else"] });

    for (const role of ["OWNER", "ADMIN", "HR"]) {
      expect(canAccessFileAcl(restricted, access({ membershipRole: role }))).toBe(
        true,
      );
    }
  });

  it("sperrt Nutzer aus, die nicht in der ACL stehen", () => {
    const restricted = file({ accessUserIdsJson: ["other-user"] });

    expect(canAccessFileAcl(restricted, access())).toBe(false);
  });

  it("erlaubt Zugriff über die Nutzer-ACL", () => {
    const restricted = file({ accessUserIdsJson: ["user-1"] });

    expect(canAccessFileAcl(restricted, access())).toBe(true);
  });

  it("erlaubt Zugriff über die Rollen-ACL", () => {
    const restricted = file({ accessRoleIdsJson: ["role-7"] });

    expect(canAccessFileAcl(restricted, access({ roleId: "role-7" }))).toBe(true);
    expect(canAccessFileAcl(restricted, access({ roleId: "role-8" }))).toBe(false);
  });

  it("sperrt bei gesetzter Rollen-ACL Nutzer ohne Rolle aus", () => {
    const restricted = file({ accessRoleIdsJson: ["role-7"] });

    expect(canAccessFileAcl(restricted, access({ roleId: null }))).toBe(false);
  });

  it("behandelt nicht-Array-ACL-Werte als leere Liste", () => {
    const broken = file({ accessUserIdsJson: "kein-array" });

    expect(canAccessFileAcl(broken, access())).toBe(true);
  });

  it("ignoriert Nicht-String-Einträge in der ACL", () => {
    const restricted = file({ accessUserIdsJson: [42, null, "user-1"] });

    expect(canAccessFileAcl(restricted, access())).toBe(true);
    expect(canAccessFileAcl(restricted, access({ userId: "user-2" }))).toBe(false);
  });
});
