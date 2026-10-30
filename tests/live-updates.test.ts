import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLiveRevision, waitForLiveRevision } from "@/lib/live-updates";

let userId: string | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId, name: "Live Test", email: "live@test.invalid" } } : null } } }));
const { GET } = await import("@/app/api/tenants/[tenant]/live/route");
const run = crypto.randomUUID();
let tenantId: string;
let otherId: string;
let memberId: string;
const slug = `live-${run}`;
const call = (suffix = "", signal?: AbortSignal, tenant = slug) => GET(new Request(`http://localhost/api/tenants/${tenant}/live${suffix}`, { signal }), { params: Promise.resolve({ tenant }) });
beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: "Live Test", slug } })).id;
  otherId = (await prisma.tenant.create({ data: { name: "Other Live Test", slug: `other-${run}` } })).id;
  memberId = (await prisma.user.create({ data: { name: "Live Member", email: `live-${run}@test.invalid` } })).id;
  await prisma.tenantMembership.create({ data: { tenantId, userId: memberId, role: "EMPLOYEE" } });
  userId = memberId;
});
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherId].filter(Boolean) } } });
  if (memberId) await prisma.user.delete({ where: { id: memberId } });
});

describe("durable live changes", () => {
  it("returns an opaque cursor without personal data and forbids other tenants", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Object.keys(await response.json())).toEqual(["revision"]);
    expect((await call("", undefined, `other-${run}`)).status).toBe(403);
    userId = null;
    expect((await call()).status).toBe(401);
    userId = memberId;
    expect((await call("?since=invalid")).status).toBe(400);
  });
  it("detects inserts, updates and deletes without service-level publishing", async () => {
    const initial = await getLiveRevision(tenantId);
    const team = await prisma.tenantTeam.create({ data: { tenantId, key: run, name: "Team" } });
    const inserted = await getLiveRevision(tenantId);
    expect(inserted).not.toBe(initial);
    await prisma.tenantTeam.update({ where: { id: team.id }, data: { name: "Changed" } });
    const updated = await getLiveRevision(tenantId);
    expect(updated).not.toBe(inserted);
    await prisma.tenantTeam.delete({ where: { id: team.id } });
    expect(await getLiveRevision(tenantId)).not.toBe(updated);
  });
  it("does not emit rolled-back or foreign-tenant changes", async () => {
    const before = await getLiveRevision(tenantId);
    await expect(prisma.$transaction(async (tx) => {
      await tx.tenantTeam.create({ data: { tenantId, key: `rollback-${run}`, name: "Rollback" } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    await prisma.tenantTeam.create({ data: { tenantId: otherId, key: run, name: "Foreign" } });
    expect(await getLiveRevision(tenantId)).toBe(before);
  });
  it("takes the shared cursor lock after domain writes, at commit", async () => {
    const before = await getLiveRevision(tenantId);
    await prisma.$transaction(async (tx) => {
      await tx.tenantTeam.create({ data: { tenantId, key: `deferred-${run}`, name: "Deferred" } });
      expect((await tx.tenantLiveRevision.findUnique({ where: { tenantId } }))?.revision).toBe(before);
    });
    expect(await getLiveRevision(tenantId)).not.toBe(before);
  });
  it("notifies for child records such as role permissions", async () => {
    const role = await prisma.tenantRole.create({ data: { tenantId, name: "Live Role", key: run } });
    const before = await getLiveRevision(tenantId);
    await prisma.tenantRolePermission.create({ data: { roleId: role.id, area: "shifts", level: "read" } });
    expect(await getLiveRevision(tenantId)).not.toBe(before);
  });
  it("wakes a pending request and catches up using an older cursor", async () => {
    const before = await getLiveRevision(tenantId);
    const pending = call(`?since=${before}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.tenant.update({ where: { id: tenantId }, data: { name: "Changed live" } });
    const response = await pending;
    expect(response.status).toBe(200);
    const next = await response.json();
    expect(next.revision).not.toBe(before);
    expect(await (await call(`?since=${before}`)).json()).toEqual(next);
  });
  it("aborts promptly when the client disconnects", async () => {
    const controller = new AbortController();
    const pending = waitForLiveRevision(tenantId, await getLiveRevision(tenantId), controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("refuses delivery after membership is revoked while waiting", async () => {
    const before = await getLiveRevision(tenantId);
    const pending = call(`?since=${before}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.tenantMembership.delete({ where: { tenantId_userId: { tenantId, userId: memberId } } });
    expect((await pending).status).toBe(403);
  });
});
