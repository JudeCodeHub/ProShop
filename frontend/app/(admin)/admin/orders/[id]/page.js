import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Order details" };

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title={`Order #${id}`}
      description="Line items, totals and payment method, with actions to void the sale or start a return."
    />
  );
}
