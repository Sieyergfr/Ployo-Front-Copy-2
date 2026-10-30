import { prisma } from "@/lib/prisma";
import { assertEmployeeInScope, requireTenantAccess } from "@/lib/tenant-access";
import { normalizeInfoRequestItems, type InfoRequestItemInput } from "@/lib/info-request-items";

export type InfoRequestDraftContent = {
  title: string;
  message: string;
  dueAt: string;
  dueTime: string;
  fileRequested: boolean;
  items: InfoRequestItemInput[];
};

/** Entwürfe dürfen unvollständig sein, behalten aber dieselben Größenlimits. */
export function normalizeInfoRequestDraft(raw: unknown): InfoRequestDraftContent {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (key: string, max: number) => typeof input[key] === "string" ? input[key].slice(0, max) : "";
  const items = Array.isArray(input.items) ? input.items.filter((item) => item && typeof item === "object").map((item) => ({
    kind: item.kind === "field" ? "field" as const : "document" as const,
    label: typeof item.label === "string" ? item.label : "",
    required: item.required !== false,
  })) : [];
  return {
    title: text("title", 240), message: text("message", 10000),
    dueAt: /^\d{4}-\d{2}-\d{2}$/.test(text("dueAt", 10)) ? text("dueAt", 10) : "",
    dueTime: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text("dueTime", 5)) ? text("dueTime", 5) : "",
    fileRequested: input.fileRequested === true,
    items: normalizeInfoRequestItems(items),
  };
}

async function draftOwner(tenant: string, handle: string) {
  const access = await requireTenantAccess(tenant, "employees", "write");
  const employee = await prisma.tenantEmployee.findFirst({ where: { tenantId: access.tenantId, key: handle }, select: { id: true } });
  if (!employee) throw new Error("Mitarbeiter nicht gefunden.");
  await assertEmployeeInScope(access, employee.id);
  return { tenantId: access.tenantId, employeeId: employee.id, authorId: access.userId };
}

export async function getInfoRequestDraft(tenant: string, handle: string) {
  const owner = await draftOwner(tenant, handle);
  const draft = await prisma.tenantInfoRequestDraft.findUnique({ where: { tenantId_employeeId_authorId: owner } });
  return draft ? { content: normalizeInfoRequestDraft(draft.content), updatedAt: draft.updatedAt.toISOString() } : null;
}

export async function saveInfoRequestDraft(tenant: string, handle: string, raw: unknown) {
  const owner = await draftOwner(tenant, handle);
  const content = normalizeInfoRequestDraft(raw);
  const draft = await prisma.tenantInfoRequestDraft.upsert({
    where: { tenantId_employeeId_authorId: owner }, create: { ...owner, content }, update: { content },
  });
  return { content, updatedAt: draft.updatedAt.toISOString() };
}

export async function deleteInfoRequestDraft(tenant: string, handle: string) {
  await prisma.tenantInfoRequestDraft.deleteMany({ where: await draftOwner(tenant, handle) });
}
