import NoAccessNotice from "@/components/NoAccessNotice";

export const metadata = {
  title: "Kein Zugriff",
};

export default async function NoAccessPage({
  params,
}: PageProps<"/u/[tenant]/kein-zugriff">) {
  const { tenant } = await params;

  return <NoAccessNotice tenant={tenant} />;
}
