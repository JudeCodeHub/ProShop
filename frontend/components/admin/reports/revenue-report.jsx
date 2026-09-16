"use client";

import { useState } from "react";
import RevenueBarChart from "@/components/admin/charts/revenue-bar-chart";
import { formatMoney, toCents } from "@/lib/money";
import { rangeQuery } from "@/lib/reports";
import { cardClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";
import { EmptyRow, ReportState, ReportTable } from "./report-shell";

const GROUPS = [
  { key: "category", label: "By category" },
  { key: "brand", label: "By brand" },
];

export default function RevenueReport({ range, currency }) {
  const [by, setBy] = useState("category");
  const query = useApi(range ? `/reports/revenue-by-category${rangeQuery(range, { by })}` : null);
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="group" aria-label="Group by">
        {GROUPS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setBy(option.key)}
            aria-pressed={by === option.key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              by === option.key ? "bg-slate-900 text-white ring-slate-900" : "text-slate-700 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ReportState query={query}>
        {(data) => (
          <>
            {data.rows.length > 0 && (
              <div className={`p-5 ${cardClass}`}>
                <RevenueBarChart rows={data.rows} currency={currency} />
              </div>
            )}
            <ReportTable
              caption={`${data.from} to ${data.to} · total ${money(data.totalRevenue)}`}
              head={
                <tr>
                  <th scope="col" className="px-4 py-3">{by === "brand" ? "Brand" : "Category"}</th>
                  <th scope="col" className="px-4 py-3 text-right">Units sold</th>
                  <th scope="col" className="px-4 py-3 text-right">Revenue</th>
                  <th scope="col" className="px-4 py-3 text-right">Share</th>
                </tr>
              }
            >
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={4} text="No sales in this period." />
              ) : (
                data.rows.map((row) => (
                  <tr key={`${row.categoryId ?? "brand"}-${row.name}`}>
                    <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.unitsSold}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(row.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {row.sharePercent === null ? "—" : `${row.sharePercent}%`}
                    </td>
                  </tr>
                ))
              )}
            </ReportTable>
          </>
        )}
      </ReportState>
    </div>
  );
}
