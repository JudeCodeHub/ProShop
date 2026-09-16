"use client";

import { useEffect, useState } from "react";
import DateRangePicker from "@/components/admin/date-range-picker";
import PageHeader from "@/components/admin/page-header";
import Alert from "@/components/admin/alert";
import { rangeError, rangePresets, REPORT_VIEWS } from "@/lib/reports";
import { useApi } from "@/lib/use-api";
import BestSellersReport from "./best-sellers-report";
import ProfitMarginReport from "./profit-margin-report";
import RevenueReport from "./revenue-report";
import SalesSummaryReport from "./sales-summary-report";
import StaffReport from "./staff-report";
import StockValuationReport from "./stock-valuation-report";

const VIEWS = {
  "sales-summary": SalesSummaryReport,
  "best-sellers": BestSellersReport,
  revenue: RevenueReport,
  staff: StaffReport,
  stock: StockValuationReport,
  profit: ProfitMarginReport,
};

const RANGELESS = new Set(["stock"]);

export default function ReportsView({ initialView }) {
  const [view, setView] = useState(initialView);
  const [range, setRange] = useState(() => {
    const [week] = rangePresets();
    return { from: week.from, to: week.to };
  });

  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const error = rangeError(range);
  const Report = VIEWS[view];

  useEffect(() => {
    window.history.replaceState(null, "", `/admin/reports?view=${view}`);
  }, [view]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, products, staff, stock and profit." />

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2" role="tablist" aria-label="Reports">
        {REPORT_VIEWS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={view === option.key}
            onClick={() => setView(option.key)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              view === option.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!RANGELESS.has(view) && (
        <div className="space-y-2">
          <DateRangePicker range={range} onChange={setRange} />
          {error && <Alert>{error}</Alert>}
        </div>
      )}

      <Report range={error ? null : range} currency={currency} />
    </div>
  );
}
