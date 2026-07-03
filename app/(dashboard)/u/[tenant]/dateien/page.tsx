import FilesPageContent from "@/components/FilesPageContent";

export const metadata = {
  title: "Dateien",
};

export default async function FilesRootPage({
  params,
}: PageProps<"/u/[tenant]/dateien">) {
  const { tenant } = await params;

  return <FilesPageContent tenant={tenant} />;
}
