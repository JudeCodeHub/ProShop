"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { buttonClass, cardClass, inputClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

export default function PurchaseOrdersTable({ initialSupplierId = "" }) {
  const [filters, setFilters] = useState({ status: "", supplierId: initialSupplierId });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status) {
      params.set("status", filters.status);
    }
    if (filters.supplierId) {
      params.set("supplierId", filters.supplierId);
    }
    const text = params.toString();
    return text ? `/purchase-orders?${text}` : "/purchase-orders";
  }, [filters]);

  const orders = useApi(query);
  const suppliers = useApi("/suppliers");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";

  const rows = orders.data ?? [];
  const setFilter = (key) => (event) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Stock you ordered from suppliers. Receiving an order adds the quantities to stock."
        actions={
          <Link href="/admin/purchase-orders/new" className={buttonClass.primary}>
            New purchase order
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select aria-label="Filter by status" value={filters.status} onChange={setFilter("status")} className={inputClass}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
        </select>
        <select
          aria-label="Filter by supplier"
          value={filters.supplierId}
          onChange={setFilter("supplierId")}
          className={inputClass}
        >
          <option value="">All suppliers</option>
          {(suppliers.data ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFilters({ status: "", supplierId: "" })}
          disabled={!filters.status && !filters.supplierId}
          className={buttonClass.secondary}
        >
          Clear
        </button>
      </div>

      {orders.error && <Alert className="mb-4">Could not load purchase orders: {orders.error.message}</Alert>}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Order</th>
              <th scope="col" className="px-4 py-3">Supplier</th>
              <th scope="col" className="px-4 py-3">Created</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Lines</th>
              <th scope="col" className="px-4 py-3 text-right">Items</th>
              <th scope="col" className="px-4 py-3 text-right">Total cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.loading && !orders.data ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading purchase orders…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No purchase orders found.</td></tr>
            ) : (
              rows.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/purchase-orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                      PO #{order.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{order.supplier.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{order.totalQty}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatMoney(toCents(order.totalCost), currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
