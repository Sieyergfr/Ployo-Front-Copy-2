import { prisma } from "@/lib/prisma";

export async function markObjectDeleted(input: {
  tenantId: string;
  fileId: string;
}) {
  return prisma.tenantFile.update({
    where: {
      id: input.fileId,
      tenantId: input.tenantId,
    },
    data: {
      status: "delete",
      deletedAt: new Date(),
    },
  });
}
