"use client";

import Link from "next/link";
import { useState } from "react";
import ReceiptDialog from "@/components/pos/receipt-dialog";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/orders";
import { useApi } from "@/lib/use-api";

const cardClass = "rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200";
const buttonPrimary =
  "inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function HeldSales() {
  const held = useApi("/orders/held");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const [busyId, setBusyId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState(null);

  const orders = held.data ?? [];
  const money = (value) => formatMoney(toCents(value), currency);

  async function resume(order) {
    if (!window.confirm(`Resume sale #${order.id} and complete it for ${money(order.total)}?`)) {
      return;
    }
    setBusyId(order.id);
    setMessage(null);
    try {
      const completed = await api.post(`/orders/${order.id}/resume`);
      held.reload();
      try {
        setReceipt(await api.get(`/orders/${completed.id}/receipt`));
      } catch (error) {
        setMessage({
          tone: "success",
          text: `Sale #${completed.id} completed, but the receipt could not be loaded: ${error.message}`,
        });
      }
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      held.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Held sales</h1>
        <p className="text-sm text-slate-600">
          Sales you parked at checkout. Resuming one completes it, takes the stock and prints the receipt.
        </p>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md px-3 py-2 text-sm ring-1 ${
            message.tone === "error"
              ? "bg-red-50 text-red-700 ring-red-200"
              : "bg-emerald-50 text-emerald-800 ring-emerald-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {held.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          Could not load held sales: {held.error.message}
        </p>
      )}

      {held.loading && !held.data ? (
        <p className="text-sm text-slate-500">Loading held sales…</p>
      ) : orders.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-sm text-slate-600">You have no held sales.</p>
          <Link href="/pos" className="mt-3 inline-block text-sm font-medium text-slate-900 underline">
            Back to checkout
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">Sale #{order.id}</p>
                  <p className="text-xs text-slate-500">
                    Held {formatDateTime(order.createdAt)} · {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
                    {order.customer ? ` · ${order.customer.name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{money(order.total)}</p>
                  <p className="text-xs text-slate-500">
                    {order.items.length} line{order.items.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-1.5">
                    <span className="text-slate-700">
                      {item.productName}{" "}
                      <span className="text-slate-500">
                        ({item.size} / {item.color})
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {item.qty} × {money(item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => resume(order)} disabled={busyId !== null} className={buttonPrimary}>
                  {busyId === order.id ? "Completing…" : "Resume and complete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
