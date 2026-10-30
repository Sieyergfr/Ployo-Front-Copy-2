import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), audit: vi.fn(),
  membership: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { tenantEmployee: mocks } }));
vi.mock("@/lib/tenant-access", () => ({
  requireTenantMembership: mocks.membership,
}));
vi.mock("@/lib/audit", () => ({ recordTenantAudit: mocks.audit }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn(() => { throw new Error("Email must not be required"); }) } } }));

import { getUnlinkedEmployeesForTenant, linkOwnTenantEmployee } from "@/lib/employee-service";

describe("self-service employee linking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ tenantId: "tenant-1", userId: "user-1", userName: "Owner", membershipRole: "OWNER" });
  });

  it("lists unlinked employees in the owner's tenant without an email restriction", async () => {
    mocks.findMany.mockResolvedValue([{ id: "employee-1", name: "Member" }]);
    expect(await getUnlinkedEmployeesForTenant("company")).toHaveLength(1);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", userId: null });
  });

  it.each(["EMPLOYEE", "ADMIN", "HR"])("does not expose unlinked records to %s", async (membershipRole) => {
    mocks.membership.mockResolvedValue({ tenantId: "tenant-1", userId: "user-1", membershipRole });
    expect(await getUnlinkedEmployeesForTenant("company")).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each(["EMPLOYEE", "ADMIN", "HR"])("rejects linking an existing record as %s", async (membershipRole) => {
    mocks.membership.mockResolvedValue({ tenantId: "tenant-1", userId: "user-1", membershipRole });
    await expect(linkOwnTenantEmployee({ tenantSlug: "company", employeeId: "employee-1" })).rejects.toThrow("FORBIDDEN");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("links an unlinked record even when its email differs from the account", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "employee-1", userId: null, name: "Member", email: "different@example.com" });
    await linkOwnTenantEmployee({ tenantSlug: "company", employeeId: "employee-1" });
    expect(mocks.findFirst.mock.calls[1][0].where).toEqual({ id: "employee-1", tenantId: "tenant-1" });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "employee-1" }, data: { userId: "user-1" } });
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("rejects a record already linked to another account", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "employee-1", userId: "other" });
    await expect(linkOwnTenantEmployee({ tenantSlug: "company", employeeId: "employee-1" })).rejects.toThrow("bereits mit einem Konto verknüpft");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects records outside the tenant", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(linkOwnTenantEmployee({ tenantSlug: "company", employeeId: "foreign" })).rejects.toThrow("nicht gefunden");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a second record for an already linked account", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "existing" });
    await expect(linkOwnTenantEmployee({ tenantSlug: "company", employeeId: "employee-1" })).rejects.toThrow("bereits mit einer Personalakte verknüpft");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
