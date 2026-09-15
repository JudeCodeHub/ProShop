"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { parseOrderRef } from "@/lib/orders";
import { returnableQty, summarizeQuotes } from "@/lib/returns";
import { buttonClass, cardClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const compactInput = inputClass.replace("px-3 py-2", "px-2 py-1");

function selectedLines(order, selections) {
  if (!order) {
    return [];
  }
  return order.items
    .map((item) => ({ item, choice: selections[item.variantId] }))
    .filter(({ choice }) => choice && choice.mode !== "none");
}

function lineLabel(item) {
  return `${item.productName} (${item.size} / ${item.color})`;
}

export default function ReturnsWorkbench({ initialOrderId }) {
  const [orderInput, setOrderInput] = useState(initialOrderId ? String(initialOrderId) : "");
  const [orderId, setOrderId] = useState(initialOrderId ?? null);
  const [lookupError, setLookupError] = useState("");
  const [selections, setSelections] = useState({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState(null);
  const [results, setResults] = useState(null);
  const [variantsByProduct, setVariantsByProduct] = useState({});

  const order = useApi(orderId ? `/orders/${orderId}` : null);
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const money = (value) => formatMoney(toCents(value), currency);

  const data = order.data;
  const lines = selectedLines(data, selections);
  const snapshot = JSON.stringify({ orderId, lines: lines.map(({ item, choice }) => [item.variantId, choice]), reason: reason.trim() });
  const currentPreview = preview?.snapshot === snapshot ? preview : null;

  useEffect(() => {
    if (!data || data.status !== "completed") {
      return undefined;
    }
    let cancelled = false;
    const productIds = [...new Set(data.items.map((item) => item.productId))];
    Promise.all(productIds.map((productId) => api.get(`/products/${productId}/variants`).then((variants) => [productId, variants])))
      .then((entries) => !cancelled && setVariantsByProduct(Object.fromEntries(entries)))
      .catch((error) => !cancelled && setMessage({ tone: "error", text: `Could not load sizes and colors: ${error.message}` }));
    return () => {
      cancelled = true;
    };
  }, [data]);

  function findOrder(event) {
    event.preventDefault();
    const id = parseOrderRef(orderInput);
    if (!id) {
      setLookupError("Enter an order number like 123, #123 or R-000123.");
      return;
    }
    setLookupError("");
    setMessage(null);
    setResults(null);
    setSelections({});
    setReason("");
    setOrderId(id);
    window.history.replaceState(null, "", `/admin/returns?orderId=${id}`);
  }

  function choose(item, changes) {
    setResults(null);
    setSelections((current) => {
      const previous = current[item.variantId] ?? { mode: "none", qty: 1, newVariantId: "" };
      return { ...current, [item.variantId]: { ...previous, ...changes } };
    });
  }

  function validationError() {
    if (lines.length === 0) {
      return "Choose at least one item to return or exchange.";
    }
    for (const { item, choice } of lines) {
      const max = returnableQty(item);
      if (!Number.isInteger(choice.qty) || choice.qty < 1 || choice.qty > max) {
        return `Quantity for ${lineLabel(item)} must be between 1 and ${max}.`;
      }
      if (choice.mode === "exchange" && !choice.newVariantId) {
        return `Choose the size or color to exchange ${lineLabel(item)} for.`;
      }
    }
    if (lines.some(({ choice }) => choice.mode === "return") && !reason.trim()) {
      return "Enter a reason for the return.";
    }
    return "";
  }

  const bodyFor = ({ item, choice }) =>
    choice.mode === "return"
      ? { orderId, variantId: item.variantId, qty: choice.qty, reason: reason.trim() }
      : {
          orderId,
          originalVariantId: item.variantId,
          newVariantId: Number(choice.newVariantId),
          qty: choice.qty,
          ...(reason.trim() && { reason: reason.trim() }),
        };

  async function runPreview() {
    const problem = validationError();
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setPreviewing(true);
    setMessage(null);
    try {
      const quotes = await Promise.all(
        lines.map((line) =>
          api.post(line.choice.mode === "return" ? "/returns/preview" : "/exchanges/preview", bodyFor(line)).then((quote) => ({ line, quote })),
        ),
      );
      setPreview({ snapshot, quotes });
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setPreviewing(false);
    }
  }

  async function confirm() {
    setConfirming(true);
    setMessage(null);
    const outcomes = [];
    for (const { line } of currentPreview.quotes) {
      try {
        const record = await api.post(line.choice.mode === "return" ? "/returns" : "/exchanges", bodyFor(line));
        outcomes.push({ line, record });
      } catch (error) {
        outcomes.push({ line, error: error.message });
      }
    }
    setResults(outcomes);
    setPreview(null);
    setSelections({});
    setReason("");
    setConfirming(false);
    order.reload();
  }

  const previewTotals = currentPreview ? summarizeQuotes(currentPreview.quotes.map(({ quote }) => quote)) : null;
  const doneTotals = results ? summarizeQuotes(results.filter((r) => r.record).map((r) => r.record)) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Returns & exchanges" description="Find the original sale, choose the items coming back, check the amounts, then confirm." />

      <form onSubmit={findOrder} className={`flex flex-wrap items-end gap-3 p-4 ${cardClass}`} noValidate>
        <div className="space-y-1">
          <label htmlFor="order-ref" className={labelClass}>Order or receipt number</label>
          <input
            id="order-ref"
            value={orderInput}
            onChange={(event) => setOrderInput(event.target.value)}
            placeholder="123 or R-000123"
            className={`${inputClass} w-56`}
          />
        </div>
        <button type="submit" className={buttonClass.primary}>Find order</button>
        {lookupError && <p className="w-full text-sm text-red-600">{lookupError}</p>}
      </form>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {results && (
        <Alert tone={results.some((r) => r.error) ? "warning" : "success"}>
          <p className="font-medium">
            {results.filter((r) => r.record).length} of {results.length} saved.
            {doneTotals.refundCents > 0 && ` Refund the customer ${formatMoney(doneTotals.refundCents, currency)}.`}
            {doneTotals.dueCents > 0 && ` Collect ${formatMoney(doneTotals.dueCents, currency)} from the customer.`}
          </p>
          <ul className="mt-1 list-inside list-disc">
            {results.map(({ line, record, error }) => (
              <li key={line.item.variantId}>
                {line.choice.mode === "return" ? "Return" : "Exchange"} {line.choice.qty} × {lineLabel(line.item)}:{" "}
                {record ? "saved" : <span className="text-red-700">{error}</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {orderId && order.error && (
        <Alert>{order.error.status === 404 ? `There is no order #${orderId}.` : `Could not load the order: ${order.error.message}`}</Alert>
      )}
      {orderId && !data && !order.error && <p className="text-sm text-slate-500">Loading order…</p>}

      {data && (
        <section className={`space-y-4 p-5 ${cardClass}`} aria-labelledby="order-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="order-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                Order #{data.id} <StatusBadge status={data.status} />
              </h2>
              <p className="text-sm text-slate-600">
                {formatDateTime(data.createdAt)} · {data.cashier.name} · {data.customer?.name ?? "Walk-in"} · total {money(data.total)}
              </p>
            </div>
            <Link href={`/admin/orders/${data.id}`} className="text-sm text-slate-600 underline">Open order</Link>
          </div>

          {data.status !== "completed" ? (
            <Alert tone="warning">Only completed orders can have returns or exchanges. This order is {data.status}.</Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th scope="col" className="px-3 py-2">Item</th>
                      <th scope="col" className="px-3 py-2 text-right">Bought</th>
                      <th scope="col" className="px-3 py-2 text-right">Can return</th>
                      <th scope="col" className="px-3 py-2">Action</th>
                      <th scope="col" className="px-3 py-2">Qty</th>
                      <th scope="col" className="px-3 py-2">Exchange for</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((item) => {
                      const max = returnableQty(item);
                      const choice = selections[item.variantId] ?? { mode: "none", qty: 1, newVariantId: "" };
                      const options = (variantsByProduct[item.productId] ?? []).filter((v) => v.id !== item.variantId);
                      return (
                        <tr key={item.variantId} className={choice.mode !== "none" ? "bg-slate-50" : ""}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900">{item.productName}</span>{" "}
                            <span className="text-slate-500">{item.size} / {item.color}</span>
                            <span className="block text-xs text-slate-500">{money(item.unitPrice)} each</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{max}</td>
                          <td className="px-3 py-2">
                            <label htmlFor={`mode-${item.variantId}`} className="sr-only">Action for {lineLabel(item)}</label>
                            <select
                              id={`mode-${item.variantId}`}
                              value={choice.mode}
                              disabled={max === 0 || confirming}
                              onChange={(event) => choose(item, { mode: event.target.value })}
                              className={compactInput}
                            >
                              <option value="none">{max === 0 ? "All returned" : "No change"}</option>
                              <option value="return">Return</option>
                              <option value="exchange">Exchange</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <label htmlFor={`qty-${item.variantId}`} className="sr-only">Quantity for {lineLabel(item)}</label>
                            <input
                              id={`qty-${item.variantId}`}
                              type="number"
                              min={1}
                              max={max}
                              value={choice.qty}
                              disabled={choice.mode === "none" || confirming}
                              onChange={(event) => choose(item, { qty: Number.parseInt(event.target.value, 10) || 0 })}
                              className={`${compactInput} w-20`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {choice.mode === "exchange" ? (
                              <>
                                <label htmlFor={`swap-${item.variantId}`} className="sr-only">Exchange {lineLabel(item)} for</label>
                                <select
                                  id={`swap-${item.variantId}`}
                                  value={choice.newVariantId}
                                  disabled={confirming}
                                  onChange={(event) => choose(item, { newVariantId: event.target.value })}
                                  className={compactInput}
                                >
                                  <option value="">Choose size / color</option>
                                  {options.map((variant) => (
                                    <option key={variant.id} value={variant.id} disabled={variant.stockQty < choice.qty}>
                                      {variant.size} / {variant.color} · {money(variant.sellPrice)} · {variant.stockQty} in stock
                                    </option>
                                  ))}
                                </select>
                                {options.length === 0 && (
                                  <span className="block text-xs text-slate-500">This product has no other sizes or colors.</span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1 space-y-1">
                  <label htmlFor="return-reason" className={labelClass}>
                    Reason <span className="font-normal text-slate-500">(required for returns)</span>
                  </label>
                  <input
                    id="return-reason"
                    value={reason}
                    maxLength={200}
                    disabled={confirming}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Wrong size, faulty, changed mind…"
                    className={inputClass}
                  />
                </div>
                <button type="button" onClick={runPreview} disabled={previewing || confirming || lines.length === 0} className={buttonClass.secondary}>
                  {previewing ? "Calculating…" : "Preview amounts"}
                </button>
              </div>

              {currentPreview && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200" aria-live="polite">
                  <h3 className="font-semibold text-slate-900">Preview</h3>
                  <ul className="space-y-2 text-sm">
                    {currentPreview.quotes.map(({ line, quote }) => (
                      <li key={line.item.variantId} className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-700">
                          {line.choice.mode === "return" ? "Return" : "Exchange"} {line.choice.qty} × {lineLabel(line.item)}
                          {quote.exchangeItem && ` for ${quote.exchangeItem.size} / ${quote.exchangeItem.color}`}
                        </span>
                        <span className="tabular-nums">
                          {line.choice.mode === "return"
                            ? `Refund ${money(quote.refundAmount)}`
                            : Number(quote.amountDue) > 0
                              ? `Customer pays ${money(quote.amountDue)}`
                              : Number(quote.refundAmount) > 0
                                ? `Refund ${money(quote.refundAmount)}`
                                : "Even swap"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
                    <div className="flex justify-between"><dt>Refund to customer</dt><dd className="tabular-nums">{formatMoney(previewTotals.refundCents, currency)}</dd></div>
                    <div className="flex justify-between"><dt>Collect from customer</dt><dd className="tabular-nums">{formatMoney(previewTotals.dueCents, currency)}</dd></div>
                    <div className="flex justify-between text-base font-semibold text-slate-900">
                      <dt>{previewTotals.netCents > 0 ? "Customer pays" : previewTotals.netCents < 0 ? "Shop refunds" : "Nothing to pay"}</dt>
                      <dd className="tabular-nums">{formatMoney(Math.abs(previewTotals.netCents), currency)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-slate-500">Refunds include the customer&apos;s share of the order discount and tax.</p>
                  <button type="button" onClick={confirm} disabled={confirming} className={buttonClass.primary}>
                    {confirming ? "Saving…" : "Confirm"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
