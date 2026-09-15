"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { ORDER_STATUSES, PAYMENT_LABELS, ordersQuery } from "@/lib/orders";
import { buttonClass, cardClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const NO_FILTERS = { from: "", to: "", cashierId: "", status: "" };

export default function OrdersTable({ initialFilters }) {
  const [filters, setFilters] = useState({
    from: initialFilters.from,
    to: initialFilters.to,
    cashierId: initialFilters.cashierId,
    status: initialFilters.status,
  });
  const [page, setPage] = useState(initialFilters.page);

  const rangeError =
    filters.from && filters.to && filters.from > filters.to
      ? "The start date must be on or before the end date."
      : "";
  const query = ordersQuery({ ...filters, page });
  const orders = useApi(rangeError ? null : `/orders${query ? `?${query}` : ""}`);
  const users = useApi("/users");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";

  useEffect(() => {
    window.history.replaceState(null, "", query ? `/admin/orders?${query}` : "/admin/orders");
  }, [query]);

  const setFilter = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
    setPage(1);
  };

  const data = orders.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div>
      <PageHeader title="Orders" description="Every sale, held sale and voided sale, newest first." />

      <div className={`mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end ${cardClass}`}>
        <div className="space-y-1">
          <label htmlFor="orders-from" className={labelClass}>From</label>
          <input id="orders-from" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter("from")} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="orders-to" className={labelClass}>To</label>
          <input id="orders-to" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter("to")} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="orders-cashier" className={labelClass}>Cashier</label>
          <select id="orders-cashier" value={filters.cashierId} onChange={setFilter("cashierId")} className={inputClass}>
            <option value="">All staff</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {user.role === "admin" ? " (admin)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="orders-status" className={labelClass}>Status</label>
          <select id="orders-status" value={filters.status} onChange={setFilter("status")} className={`${inputClass} capitalize`}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!hasFilters}
          onClick={() => {
            setFilters(NO_FILTERS);
            setPage(1);
          }}
          className={buttonClass.secondary}
        >
          Clear
        </button>
      </div>

      {rangeError && <Alert className="mb-4">{rangeError}</Alert>}
      {orders.error && <Alert className="mb-4">Could not load orders: {orders.error.message}</Alert>}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Order</th>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Cashier</th>
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="px-4 py-3 text-right">Items</th>
              <th scope="col" className="px-4 py-3">Payment</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${orders.loading && data ? "opacity-60" : ""}`}>
            {!data && !orders.error && !rangeError ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading orders…</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {hasFilters ? "No orders match these filters." : "No orders yet."}
                </td>
              </tr>
            ) : (
              data.items.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                      #{order.id}
                    </Link>
                    {order.returnCount > 0 && (
                      <span className="ml-2 text-xs text-sky-700">
                        {order.returnCount} return{order.returnCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{order.cashier.name}</td>
                  <td className="px-4 py-3 text-slate-600">{order.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td>
                  <td className="px-4 py-3 text-slate-600">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(toCents(order.total), currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} order{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={buttonClass.secondary}>
              Previous
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={buttonClass.secondary}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
