"use client";

import Alert from "@/components/admin/alert";
import StatCard from "@/components/admin/stat-card";
import { formatMoney, toCents } from "@/lib/money";
import { rangeQuery } from "@/lib/reports";
import { useApi } from "@/lib/use-api";
import { ReportState } from "./report-shell";

export default function ProfitMarginReport({ range, currency }) {
  const query = useApi(range ? `/reports/profit-margin${rangeQuery(range)}` : null);
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <ReportState query={query}>
      {(data) => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Net sales" value={money(data.netSales)} hint={`${data.unitsSold} items · after discounts, before tax`} />
            <StatCard label="Cost of goods" value={money(data.cost)} />
            <StatCard
              label="Gross profit"
              value={money(data.grossProfit)}
              tone={Number(data.grossProfit) < 0 ? "text-red-600" : "text-emerald-700"}
            />
            <StatCard label="Margin" value={data.marginPercent === null ? "—" : `${data.marginPercent}%`} />
          </div>
          <Alert tone="info">
            Cost uses each product&apos;s current cost price, so changing a cost price also changes past profit.
            Refunds are not subtracted yet.
          </Alert>
          <p className="text-sm text-slate-500">{data.from} to {data.to}</p>
        </div>
      )}
    </ReportState>
  );
}
