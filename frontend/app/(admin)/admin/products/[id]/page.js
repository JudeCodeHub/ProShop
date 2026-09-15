import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Edit product" };

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title={`Product #${id}`}
      description="Edit the product and manage its size and color variants."
    />
  );
}
