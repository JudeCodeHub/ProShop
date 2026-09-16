"use client";

import StatCard from "@/components/admin/stat-card";
import { formatMoney, toCents } from "@/lib/money";
import { useApi } from "@/lib/use-api";
import { EmptyRow, ReportState, ReportTable } from "./report-shell";

export default function StockValuationReport({ currency }) {
  const query = useApi("/reports/stock-valuation");
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <ReportState query={query}>
      {(data) => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Units in stock" value={data.totalUnits} />
            <StatCard label="Value at cost" value={money(data.costValue)} hint="What the stock cost the shop" />
            <StatCard label="Value at retail" value={money(data.retailValue)} hint="What it would sell for" />
          </div>

          <ReportTable
            caption="Current stock, not affected by the date range"
            head={
              <tr>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3 text-right">Units</th>
                <th scope="col" className="px-4 py-3 text-right">Value at cost</th>
                <th scope="col" className="px-4 py-3 text-right">Value at retail</th>
              </tr>
            }
          >
            {data.byCategory.length === 0 ? (
              <EmptyRow colSpan={4} text="No stock yet." />
            ) : (
              data.byCategory.map((row) => (
                <tr key={row.categoryId}>
                  <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.units}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(row.costValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(row.retailValue)}</td>
                </tr>
              ))
            )}
          </ReportTable>
        </div>
      )}
    </ReportState>
  );
}
