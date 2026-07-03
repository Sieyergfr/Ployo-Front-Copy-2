import { prisma } from "@/lib/prisma";

export const tenantRoles = {
  owner: "OWNER",
  employee: "EMPLOYEE",
} as const;

export type TenantRole = (typeof tenantRoles)[keyof typeof tenantRoles];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function createUniqueTenantSlug(name: string) {
  const baseSlug = slugify(name) || "unternehmen";
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function getTenantsForUser(userId: string) {
  return prisma.tenantMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      tenant: true,
    },
  });
}

export async function createTenantForOwner({
  name,
  userId,
}: {
  name: string;
  userId: string;
}) {
  const slug = await createUniqueTenantSlug(name);

  return prisma.tenant.create({
    data: {
      name,
      slug,
      memberships: {
        create: {
          userId,
          role: tenantRoles.owner,
        },
      },
    },
    include: {
      memberships: true,
    },
  });
}
