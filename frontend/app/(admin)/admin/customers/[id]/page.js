import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Customer details" };

export default async function CustomerDetailPage({ params }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title={`Customer #${id}`}
      description="Profile, loyalty points balance and full purchase history."
    />
  );
}
