import ReportsView from "@/components/admin/reports/reports-view";
import { isReportView } from "@/lib/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }) {
  const { view } = await searchParams;
  const initialView = typeof view === "string" && isReportView(view) ? view : "sales-summary";
  return <ReportsView initialView={initialView} />;
}
