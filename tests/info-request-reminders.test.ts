import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { remindEmployeeOfInfoRequest } from "@/lib/info-request-reminders";
import { POST } from "@/app/api/tenants/[tenant]/info-requests/[requestId]/remind/route";
import { renderNotification } from "@/lib/notifications/messages";

let actorId = "";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: actorId, name: "Reminder actor", email: "actor@test.invalid" } }) } } }));
// Test the real in-app delivery; never send external mail or push from tests.
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => false, sendEmail: vi.fn() }));
vi.mock("@/lib/notifications/expo-push", () => ({ isExpoPushToken: () => false, sendExpoPushMessages: vi.fn(), toPushBody: (text: string) => text }));

const run = Math.random().toString(36).slice(2);
const slug = `info-reminder-${run}`;
let tenantId: string;
let ownerId: string;
let employeeUserId: string;
let managerId: string;
let employeeId: string;
let managerRoleId: string;
let requestId: string;
let teamId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug, name: "Reminder company" } }); tenantId = tenant.id;
  const users = await Promise.all(["owner", "employee", "manager"].map((name) => prisma.user.create({ data: { name, email: `${name}-remind-${run}@ployo.invalid`, emailVerified: true } })));
  [ownerId, employeeUserId, managerId] = users.map((user) => user.id);
  const role = await prisma.tenantRole.create({ data: { tenantId, key: "scoped", name: "Team manager", permissions: { create: { area: "employees", level: "write", scope: "team" } } } }); managerRoleId = role.id;
  await prisma.tenantMembership.createMany({ data: [{ tenantId, userId: ownerId, role: "OWNER" }, { tenantId, userId: employeeUserId, role: "EMPLOYEE" }, { tenantId, userId: managerId, role: "EMPLOYEE", roleId: role.id }] });
  const employee = await prisma.tenantEmployee.create({ data: { tenantId, userId: employeeUserId, key: "recipient", name: "Recipient", initials: "RE", employeeNumber: "R-1", team: "Blue" } }); employeeId = employee.id;
  const manager = await prisma.tenantEmployee.create({ data: { tenantId, userId: managerId, key: "manager", name: "Manager", initials: "MA", employeeNumber: "R-2", team: "Blue" } });
  const team = await prisma.tenantTeam.create({ data: { tenantId, key: "blue", name: "Blue" } }); teamId = team.id;
  await prisma.tenantTeamMember.create({ data: { teamId, employeeId: manager.id, name: "Manager", initials: "MA", location: "", role: "Manager", contract: "" } });
  await prisma.userPreference.create({ data: { userId: employeeUserId, language: "en" } });
  await prisma.tenantSettings.create({ data: { tenantId, mailNotifications: false, mobilePush: false, inAppNotifications: true } });
});
beforeEach(async () => {
  actorId = ownerId;
  await prisma.tenantTeamMember.deleteMany({ where: { teamId, employeeId } });
  await prisma.tenantTeamMember.create({ data: { teamId, employeeId, name: "Recipient", initials: "RE", location: "", role: "Employee", contract: "" } });
  await prisma.tenantEmployeeInfoRequest.deleteMany({ where: { tenantId } });
  await prisma.tenantEmployeeNotification.deleteMany({ where: { tenantId } });
  await prisma.tenantEmployee.update({ where: { id: employeeId }, data: { userId: employeeUserId, team: "Blue" } });
  await prisma.tenantRolePermission.update({ where: { roleId_area: { roleId: managerRoleId, area: "employees" } }, data: { scope: "team", level: "write" } });
  await prisma.tenantSettings.update({ where: { tenantId }, data: { inAppNotifications: true } });
  const request = await prisma.tenantEmployeeInfoRequest.create({ data: { tenantId, employeeId, title: "Missing certificate", requestedBy: "HR", dueAt: new Date("2027-01-15T12:00:00Z") } }); requestId = request.id;
});
afterAll(async () => {
  await prisma.appRateLimit.deleteMany({ where: { OR: [{ key: { startsWith: `info-request-reminder:${tenantId}:` } }, { key: `info-request-reminder-actor:${ownerId}` }, { key: `info-request-reminder-actor:${employeeUserId}` }] } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeUserId, managerId] } } });
  await prisma.$disconnect();
});

describe("Info request reminders", () => {
  it("delivers an unread reminder in the recipient language, with a deep link and audit entry", async () => {
    const result = await remindEmployeeOfInfoRequest(slug, requestId);
    expect(result.channels).toEqual(["in-app"]);
    const notification = await prisma.tenantEmployeeNotification.findFirstOrThrow({ where: { tenantId, userId: employeeUserId } });
    expect(notification).toMatchObject({ title: "Reminder: Missing certificate", entityType: "info-request", entityId: requestId, read: false });
    expect(notification.detail).toContain("open information request");
    expect(await prisma.tenantAuditLog.count({ where: { tenantId, action: "An offene Info-Anfrage erinnert" } })).toBeGreaterThan(0);
    expect((await prisma.tenantEmployeeInfoRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("open");
  });
  it.each(["review", "uploaded", "cancelled"] as const)("refuses %s requests", async (status) => {
    await prisma.tenantEmployeeInfoRequest.update({ where: { id: requestId }, data: { status } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.tenantEmployeeNotification.count({ where: { tenantId } })).toBe(0);
  });
  it("refuses unlinked records and reports when all delivery channels are disabled", async () => {
    await prisma.tenantEmployee.update({ where: { id: employeeId }, data: { userId: null } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("kein Konto verknüpft") });
    await prisma.tenantEmployee.update({ where: { id: employeeId }, data: { userId: employeeUserId } });
    await prisma.tenantSettings.update({ where: { tenantId }, data: { inAppNotifications: false } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toMatchObject({ status: 503 });
  });
  it("checks write access, tenant boundaries, team scope and refuses own-only access", async () => {
    actorId = employeeUserId;
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toThrow("FORBIDDEN");
    actorId = ownerId;
    await expect(remindEmployeeOfInfoRequest(`foreign-${run}`, requestId)).rejects.toThrow("FORBIDDEN");
    await expect(remindEmployeeOfInfoRequest(slug, "unknown-request")).rejects.toThrow("nicht gefunden");
    actorId = managerId;
    await prisma.tenantTeamMember.deleteMany({ where: { teamId, employeeId } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toThrow("FORBIDDEN");
    await prisma.tenantTeamMember.create({ data: { teamId, employeeId, name: "Recipient", initials: "RE", location: "", role: "Employee", contract: "" } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).resolves.toMatchObject({ channels: ["in-app"] });
    await prisma.tenantRolePermission.update({ where: { roleId_area: { roleId: managerRoleId, area: "employees" } }, data: { scope: "own" } });
    await expect(remindEmployeeOfInfoRequest(slug, requestId)).rejects.toThrow("FORBIDDEN");
  });
  it("allows only one concurrent reminder per request across senders/surfaces", async () => {
    const results = await Promise.allSettled([remindEmployeeOfInfoRequest(slug, requestId), remindEmployeeOfInfoRequest(slug, requestId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.tenantEmployeeNotification.count({ where: { tenantId } })).toBe(1);
  });
  it("exposes the shared API contract including cooldown and authentication", async () => {
    const context = { params: Promise.resolve({ tenant: slug, requestId }) };
    const request = () => new Request("http://localhost/api/remind", { method: "POST" });
    let response = await POST(request(), context); expect(response.status).toBe(200);
    expect((await response.json()).channels).toEqual(["in-app"]);
    response = await POST(request(), context); expect(response.status).toBe(429); expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    actorId = ""; response = await POST(request(), context); expect(response.status).toBe(401);
    actorId = employeeUserId; response = await POST(request(), context); expect(response.status).toBe(403);
  });
  it("renders distinct, escaped reminder messages in both languages", () => {
    const message = { key: "infoRequestReminder" as const, tenantName: "A & B", title: "<script>test</script>", dueAt: null };
    const de = renderNotification(message, "de"); const en = renderNotification(message, "en");
    expect(de.subject).toContain("Erinnerung:"); expect(de.text).toContain("offene Info-Anfrage"); expect(en.text).toContain("open information request");
    expect(de.html).not.toContain("<script>"); expect(de.html).toContain("&lt;script&gt;");
  });
});
