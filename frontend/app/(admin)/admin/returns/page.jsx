import ReturnsWorkbench from "@/components/admin/returns/returns-workbench";
import { parseOrderRef } from "@/lib/orders";

export const metadata = { title: "Returns & exchanges" };

export default async function ReturnsPage({ searchParams }) {
  const { orderId } = await searchParams;
  return <ReturnsWorkbench initialOrderId={parseOrderRef(orderId)} />;
}
