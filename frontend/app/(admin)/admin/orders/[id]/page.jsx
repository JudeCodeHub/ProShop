import OrderDetail from "@/components/admin/orders/order-detail";

export const metadata = { title: "Order details" };

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
