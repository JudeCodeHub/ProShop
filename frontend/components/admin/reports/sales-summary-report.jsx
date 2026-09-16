"use client";

import { useState } from "react";
import SalesTrendChart from "@/components/admin/charts/sales-trend-chart";
import { formatDay } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { rangeQuery } from "@/lib/reports";
import { cardClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";
import { EmptyRow, ReportState, ReportTable } from "./report-shell";

const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export default function SalesSummaryReport({ range, currency }) {
  const [period, setPeriod] = useState("daily");
  const query = useApi(range ? `/reports/sales-summary${rangeQuery(range, { period })}` : null);
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="group" aria-label="Period">
        {PERIODS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setPeriod(option.key)}
            aria-pressed={period === option.key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              period === option.key ? "bg-slate-900 text-white ring-slate-900" : "text-slate-700 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ReportState query={query}>
        {(data) => (
          <>
            <div className={`p-5 ${cardClass}`}>
              <SalesTrendChart buckets={data.buckets} currency={currency} />
            </div>

            <ReportTable
              caption={`${data.from} to ${data.to} · ${data.period} · times in ${data.timeZone}`}
              head={
                <tr>
                  <th scope="col" className="px-4 py-3">Period</th>
                  <th scope="col" className="px-4 py-3 text-right">Orders</th>
                  <th scope="col" className="px-4 py-3 text-right">Items</th>
                  <th scope="col" className="px-4 py-3 text-right">Gross</th>
                  <th scope="col" className="px-4 py-3 text-right">Discounts</th>
                  <th scope="col" className="px-4 py-3 text-right">Net sales</th>
                  <th scope="col" className="px-4 py-3 text-right">Tax</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                </tr>
              }
            >
              {data.buckets.length === 0 ? (
                <EmptyRow colSpan={8} text="No sales in this period." />
              ) : (
                <>
                  {data.buckets.map((bucket) => (
                    <tr key={bucket.periodStart} className={bucket.orders === 0 ? "text-slate-400" : ""}>
                      <td className="whitespace-nowrap px-4 py-2">{formatDay(bucket.periodStart)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{bucket.orders}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{bucket.itemsSold}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(bucket.grossSales)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(bucket.discounts)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(bucket.netSales)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(bucket.tax)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{money(bucket.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-2">Totals</td>
                    <td className="px-4 py-2 text-right tabular-nums">{data.totals.orders}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{data.totals.itemsSold}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(data.totals.grossSales)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(data.totals.discounts)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(data.totals.netSales)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(data.totals.tax)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(data.totals.total)}</td>
                  </tr>
                </>
              )}
            </ReportTable>
          </>
        )}
      </ReportState>
    </div>
  );
}
