import FilesPageContent from "@/components/FilesPageContent";

export default async function FilesRootPage({
  params,
}: PageProps<"/u/[tenant]/dateien">) {
  const { tenant } = await params;

  return <FilesPageContent tenant={tenant} />;
}
