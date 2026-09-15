import OrdersTable from "@/components/admin/orders/orders-table";

export const metadata = { title: "Orders" };

const text = (value) => (typeof value === "string" ? value : "");

export default async function OrdersPage({ searchParams }) {
  const params = await searchParams;
  const page = Number.parseInt(text(params.page), 10);

  return (
    <OrdersTable
      initialFilters={{
        from: text(params.from),
        to: text(params.to),
        cashierId: text(params.cashierId),
        status: text(params.status),
        page: Number.isInteger(page) && page > 0 ? page : 1,
      }}
    />
  );
}
