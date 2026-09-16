import PurchaseOrdersTable from "@/components/admin/purchase-orders/purchase-orders-table";

export const metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }) {
  const { supplierId } = await searchParams;
  return <PurchaseOrdersTable initialSupplierId={supplierId ?? ""} />;
}
