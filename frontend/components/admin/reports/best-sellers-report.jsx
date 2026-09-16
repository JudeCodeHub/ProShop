"use client";

import { useState } from "react";
import { formatMoney, toCents } from "@/lib/money";
import { rangeQuery } from "@/lib/reports";
import { inputClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";
import { EmptyRow, ReportState, ReportTable } from "./report-shell";

export default function BestSellersReport({ range, currency }) {
  const [limit, setLimit] = useState(10);
  const query = useApi(range ? `/reports/best-sellers${rangeQuery(range, { limit })}` : null);
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label htmlFor="best-sellers-limit" className="text-sm font-medium text-slate-700">Show top</label>
        <select
          id="best-sellers-limit"
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          className={`${inputClass} w-28`}
        >
          {[10, 20, 50].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <ReportState query={query}>
        {(data) => (
          <ReportTable
            caption={`${data.from} to ${data.to} · by units sold`}
            head={
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3">SKU</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3 text-right">Units sold</th>
                <th scope="col" className="px-4 py-3 text-right">Revenue</th>
                <th scope="col" className="px-4 py-3 text-right">Stock left</th>
              </tr>
            }
          >
            {data.items.length === 0 ? (
              <EmptyRow colSpan={7} text="Nothing was sold in this period." />
            ) : (
              data.items.map((item, index) => (
                <tr key={item.variantId}>
                  <td className="px-4 py-2 text-slate-500 tabular-nums">{index + 1}</td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-slate-900">{item.productName}</span>{" "}
                    <span className="text-slate-500">{item.size} / {item.color}</span>
                    <span className="block text-xs text-slate-500">{item.brand}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.sku}</td>
                  <td className="px-4 py-2 text-slate-600">{item.category}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{item.unitsSold}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(item.revenue)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${item.stockLeft === 0 ? "text-red-600" : "text-slate-600"}`}>
                    {item.stockLeft}
                  </td>
                </tr>
              ))
            )}
          </ReportTable>
        )}
      </ReportState>
    </div>
  );
}
