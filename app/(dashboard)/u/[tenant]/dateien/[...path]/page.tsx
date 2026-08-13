import FilesPageContent from "@/components/FilesPageContent";

export const metadata = {
  title: "Dateien",
};

export default async function FilesPathPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/dateien/[...path]">) {
  const { tenant, path } = await params;
  const query = await searchParams;

  return <FilesPageContent tenant={tenant} path={path} page={query.page} />;
}
