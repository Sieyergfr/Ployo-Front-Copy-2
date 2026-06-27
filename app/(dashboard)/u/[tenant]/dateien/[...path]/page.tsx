import FilesPageContent from "@/components/FilesPageContent";

export default async function FilesPathPage({
  params,
}: PageProps<"/u/[tenant]/dateien/[...path]">) {
  const { tenant, path } = await params;

  return <FilesPageContent tenant={tenant} path={path} />;
}
