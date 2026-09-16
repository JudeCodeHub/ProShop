"use client";

import Link from "next/link";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import SalesTrendChart from "@/components/admin/charts/sales-trend-chart";
import PageHeader from "@/components/admin/page-header";
import StatCard from "@/components/admin/stat-card";
import StatusBadge from "@/components/admin/status-badge";
import { addDays, formatDateTime, todayInStore } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { cardClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

export default function Dashboard() {
  const [days, setDays] = useState(7);
  const today = todayInStore();
  const from = addDays(today, -(days - 1));

  const summary = useApi(`/reports/sales-summary?period=daily&from=${from}&to=${today}`);
  const lowStock = useApi("/inventory/low-stock");
  const recent = useApi("/orders?pageSize=8");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const money = (value) => formatMoney(toCents(value), currency);

  const buckets = summary.data?.buckets ?? [];
  const todayBucket = buckets.find((bucket) => bucket.periodStart === today);
  const totals = summary.data?.totals;
  const lowStockItems = lowStock.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Store day: ${today} (Asia/Colombo)`} />

      {summary.error && <Alert>Could not load sales: {summary.error.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales today" value={todayBucket ? money(todayBucket.total) : "—"} hint={todayBucket ? `${todayBucket.orders} orders` : "No sales yet"} />
        <StatCard label="Items sold today" value={todayBucket ? todayBucket.itemsSold : "—"} />
        <StatCard label={`Sales last ${days} days`} value={totals ? money(totals.total) : "—"} hint={totals ? `${totals.orders} orders` : undefined} />
        <StatCard
          label="Low stock items"
          value={lowStock.data ? lowStockItems.length : "—"}
          tone={lowStockItems.length > 0 ? "text-amber-600" : "text-slate-900"}
          hint={lowStock.error ? "Could not load" : "Below the alert level"}
        />
      </div>

      <section className={`p-5 ${cardClass}`} aria-labelledby="trend-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="trend-title" className="font-semibold text-slate-900">Sales trend</h2>
          <div className="flex gap-1" role="group" aria-label="Chart range">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                onClick={() => setDays(range.days)}
                aria-pressed={days === range.days}
                className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
                  days === range.days ? "bg-slate-900 text-white ring-slate-900" : "text-slate-700 ring-slate-300 hover:bg-slate-100"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        {buckets.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">{summary.loading ? "Loading sales…" : "No sales in this period."}</p>
        ) : (
          <SalesTrendChart buckets={buckets} currency={currency} />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={`overflow-hidden ${cardClass}`} aria-labelledby="low-stock-title">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id="low-stock-title" className="font-semibold text-slate-900">Low stock</h2>
            <Link href="/admin/products" className="text-sm text-slate-600 underline">All products</Link>
          </div>
          {lowStock.error ? (
            <Alert className="m-4">Could not load low stock: {lowStock.error.message}</Alert>
          ) : lowStockItems.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {lowStock.loading ? "Loading…" : "Nothing is running low."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStockItems.slice(0, 8).map((variant) => (
                <li key={variant.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{variant.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {variant.size} / {variant.color} · {variant.product.category?.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`tabular-nums ${variant.stockQty === 0 ? "font-medium text-red-600" : "text-amber-600"}`}>
                      {variant.stockQty} left
                    </span>
                    <Link href={`/admin/stock-adjustments?barcode=${encodeURIComponent(variant.barcode)}`} className="text-xs text-slate-600 underline">
                      Adjust
                    </Link>
                  </div>
                </li>
              ))}
              {lowStockItems.length > 8 && (
                <li className="px-4 py-2 text-xs text-slate-500">and {lowStockItems.length - 8} more</li>
              )}
            </ul>
          )}
        </section>

        <section className={`overflow-hidden ${cardClass}`} aria-labelledby="recent-title">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id="recent-title" className="font-semibold text-slate-900">Recent transactions</h2>
            <Link href="/admin/orders" className="text-sm text-slate-600 underline">All orders</Link>
          </div>
          {recent.error ? (
            <Alert className="m-4">Could not load orders: {recent.error.message}</Alert>
          ) : (recent.data?.items ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{recent.loading ? "Loading…" : "No sales yet."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th scope="col" className="px-4 py-2">Order</th>
                    <th scope="col" className="px-4 py-2">When</th>
                    <th scope="col" className="px-4 py-2">Cashier</th>
                    <th scope="col" className="px-4 py-2">Status</th>
                    <th scope="col" className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.data.items.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link href={`/admin/orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                          #{order.id}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(order.createdAt)}</td>
                      <td className="px-4 py-2 text-slate-600">{order.cashier.name}</td>
                      <td className="px-4 py-2"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
