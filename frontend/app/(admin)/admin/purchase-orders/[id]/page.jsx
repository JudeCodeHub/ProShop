import PurchaseOrderDetail from "@/components/admin/purchase-orders/purchase-order-detail";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }) {
  const { id } = await params;
  return <PurchaseOrderDetail id={id} />;
}
