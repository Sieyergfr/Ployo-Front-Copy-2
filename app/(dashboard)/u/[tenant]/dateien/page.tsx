import FilesPageContent from "@/components/FilesPageContent";

export const metadata = {
  title: "Dateien",
};

export default async function FilesRootPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/dateien">) {
  const { tenant } = await params;
  const query = await searchParams;

  return <FilesPageContent tenant={tenant} page={query.page} />;
}
