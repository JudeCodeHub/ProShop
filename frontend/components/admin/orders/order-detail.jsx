"use client";

import Link from "next/link";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { API_BASE_PATH, api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/orders";
import { returnableQty } from "@/lib/returns";
import { buttonClass, cardClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const BACK = { href: "/admin/orders", label: "Orders" };

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function TotalRow({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold text-slate-900" : "text-sm text-slate-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export default function OrderDetail({ id }) {
  const order = useApi(`/orders/${encodeURIComponent(id)}`);
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  if (order.error) {
    const missing = order.error.status === 404 || order.error.status === 400;
    return (
      <div>
        <PageHeader title="Order not found" back={BACK} />
        <Alert>{missing ? `There is no order #${id}.` : order.error.message}</Alert>
      </div>
    );
  }
  if (!order.data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const data = order.data;
  const money = (value) => formatMoney(toCents(value), currency);
  const itemsByVariant = new Map(data.items.map((item) => [item.variantId, item]));
  const canReturn = data.status === "completed" && data.items.some((item) => returnableQty(item) > 0);
  const canVoid = data.status !== "voided" && data.returns.length === 0;

  async function voidOrder() {
    const stockNote = data.status === "completed" ? " Its items will go back into stock." : "";
    if (!window.confirm(`Void order #${data.id}?${stockNote}`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/orders/${data.id}/void`);
      setMessage({ tone: "success", text: `Order #${data.id} was voided.` });
      order.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={BACK}
        title={
          <span className="flex items-center gap-3">
            Order #{data.id} <StatusBadge status={data.status} />
          </span>
        }
        description={formatDateTime(data.createdAt)}
        actions={
          <>
            <a href={`${API_BASE_PATH}/orders/${data.id}/receipt/pdf`} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary}>
              Print receipt
            </a>
            {canReturn && (
              <Link href={`/admin/returns?orderId=${data.id}`} className={buttonClass.primary}>
                Start a return
              </Link>
            )}
            {canVoid && (
              <button type="button" onClick={voidOrder} disabled={busy} className={buttonClass.danger}>
                {busy ? "Voiding…" : "Void order"}
              </button>
            )}
          </>
        }
      />

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {data.status !== "voided" && data.returns.length > 0 && (
        <Alert tone="info">This order has returns, so it can no longer be voided.</Alert>
      )}

      <dl className={`grid gap-4 p-5 sm:grid-cols-4 ${cardClass}`}>
        <Info label="Cashier">{data.cashier.name}</Info>
        <Info label="Customer">{data.customer?.name ?? "Walk-in"}</Info>
        <Info label="Payment">{PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod}</Info>
        <Info label="Items">{data.items.reduce((sum, item) => sum + item.qty, 0)}</Info>
      </dl>

      <section className={`overflow-hidden ${cardClass}`} aria-labelledby="items-title">
        <h2 id="items-title" className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Items</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3">SKU</th>
                <th scope="col" className="px-4 py-3 text-right">Qty</th>
                <th scope="col" className="px-4 py-3 text-right">Returned</th>
                <th scope="col" className="px-4 py-3 text-right">Unit price</th>
                <th scope="col" className="px-4 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/products/${item.productId}`} className="font-medium text-slate-900 hover:underline">
                      {item.productName}
                    </Link>{" "}
                    <span className="text-slate-500">{item.size} / {item.color}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.qty}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${item.returnedQty ? "text-sky-700" : "text-slate-400"}`}>{item.returnedQty}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 border-t border-slate-200 px-4 py-4">
          <TotalRow label="Subtotal" value={money(data.subtotal)} />
          {Number(data.discount) > 0 && <TotalRow label="Discount" value={`−${money(data.discount)}`} />}
          <TotalRow label={`Tax (${Number(data.taxRate)}%)`} value={money(data.tax)} />
          <TotalRow label="Total" value={money(data.total)} strong />
        </dl>
      </section>

      <section className={`overflow-hidden ${cardClass}`} aria-labelledby="returns-title">
        <h2 id="returns-title" className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Returns &amp; exchanges</h2>
        {data.returns.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No returns or exchanges for this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Item</th>
                  <th scope="col" className="px-4 py-3 text-right">Qty</th>
                  <th scope="col" className="px-4 py-3 text-right">Refunded</th>
                  <th scope="col" className="px-4 py-3 text-right">Collected</th>
                  <th scope="col" className="px-4 py-3">Reason</th>
                  <th scope="col" className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.returns.map((record) => {
                  const item = itemsByVariant.get(record.variantId);
                  return (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(record.createdAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={record.type} /></td>
                      <td className="px-4 py-3 text-slate-700">
                        {item ? `${item.size} / ${item.color}` : `Variant ${record.variantId}`}
                        {record.exchangeItem && (
                          <span className="text-slate-500"> → {record.exchangeItem.size} / {record.exchangeItem.color}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{record.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(record.refundAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(record.amountDue)}</td>
                      <td className="px-4 py-3 text-slate-600">{record.reason}</td>
                      <td className="px-4 py-3 text-slate-600">{record.processedBy.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
