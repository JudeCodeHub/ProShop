import StockAdjustments from "@/components/admin/stock-adjustments";

export const metadata = { title: "Stock adjustments" };

export default async function StockAdjustmentsPage({ searchParams }) {
  const { barcode } = await searchParams;
  return <StockAdjustments initialBarcode={typeof barcode === "string" ? barcode : undefined} />;
}
