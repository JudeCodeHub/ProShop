"use client";

import { useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { buttonClass, cardClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

export default function PurchaseOrderDetail({ id }) {
  const order = useApi(`/purchase-orders/${id}`);
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const data = order.data;

  async function receive() {
    if (!window.confirm(`Mark PO #${data.id} as received? This adds the quantities to stock.`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/purchase-orders/${data.id}/receive`);
      setMessage({ tone: "success", text: "Received. Stock has been updated." });
      order.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (order.error) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Purchase order" back={{ href: "/admin/purchase-orders", label: "Purchase orders" }} />
        <Alert>Could not load this purchase order: {order.error.message}</Alert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Purchase order" back={{ href: "/admin/purchase-orders", label: "Purchase orders" }} />
        <p className="text-sm text-slate-500">Loading purchase order…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`PO #${data.id}`}
        description={`${data.supplier.name} · created ${formatDateTime(data.createdAt)}`}
        back={{ href: "/admin/purchase-orders", label: "Purchase orders" }}
        actions={
          data.status === "pending" ? (
            <button type="button" onClick={receive} disabled={busy} className={buttonClass.primary}>
              {busy ? "Receiving…" : "Mark as received"}
            </button>
          ) : null
        }
      />

      {message && <Alert tone={message.tone} className="mb-4">{message.text}</Alert>}

      <div className={`mb-4 flex flex-wrap items-center gap-6 p-4 ${cardClass}`}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1"><StatusBadge status={data.status} /></p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Items</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{data.totalQty}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total cost</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {formatMoney(toCents(data.totalCost), currency)}
          </p>
        </div>
      </div>

      {data.status === "pending" && (
        <Alert tone="info" className="mb-4">
          This order has not been received yet. Stock and cost prices change only when you mark it as received.
        </Alert>
      )}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Product</th>
              <th scope="col" className="px-4 py-3">SKU</th>
              <th scope="col" className="px-4 py-3 text-right">Quantity</th>
              <th scope="col" className="px-4 py-3 text-right">Cost each</th>
              <th scope="col" className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">{item.productName}</span>
                  <span className="block text-xs text-slate-500">{item.size} · {item.color}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.sku}</td>
                <td className="px-4 py-3 text-right tabular-nums">{item.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(toCents(item.costPrice), currency)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatMoney(toCents(item.lineTotal), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
