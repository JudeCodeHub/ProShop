"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { buttonClass, cardClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const REASONS = ["Received stock", "Damaged", "Miscount", "Theft", "Returned to supplier", "Other"];
const SEARCH_DELAY_MS = 250;
const EMPTY_FORM = { direction: "add", qty: "", reason: REASONS[0], otherReason: "" };

function toVariant(product, variant) {
  return {
    id: variant.id,
    productId: product.id,
    name: product.name,
    brand: product.brand,
    size: variant.size,
    color: variant.color,
    sku: variant.sku,
    stockQty: variant.stockQty,
  };
}

const label = (variant) => `${variant.name} (${variant.size} / ${variant.color})`;

export default function StockAdjustments({ initialBarcode }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ term: "", items: [], error: "" });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const history = useApi(
    selected ? `/inventory/stock-adjustments?variantId=${selected.id}` : "/inventory/stock-adjustments?limit=50",
  );

  const term = query.trim();
  const searchIsCurrent = term !== "" && search.term === term;

  useEffect(() => {
    if (!initialBarcode) {
      return undefined;
    }
    let cancelled = false;
    api.get(`/variants/barcode/${encodeURIComponent(initialBarcode)}`).then(
      (variant) => !cancelled && setSelected(toVariant(variant.product, variant)),
      (error) =>
        !cancelled &&
        setMessage({
          tone: "error",
          text: error.status === 404 ? `No variant has the barcode ${initialBarcode}.` : error.message,
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [initialBarcode]);

  useEffect(() => {
    if (!term) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const products = await api.get(`/products?search=${encodeURIComponent(term)}`, { signal: controller.signal });
        setSearch({ term, items: products.flatMap((p) => p.variants.map((v) => toVariant(p, v))), error: "" });
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearch({ term, items: [], error: error.message });
        }
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function choose(variant) {
    setSelected(variant);
    setQuery("");
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  const qty = Number(form.qty);
  const qtyValid = form.qty.trim() !== "" && Number.isInteger(qty) && qty > 0;
  const change = form.direction === "add" ? qty : -qty;
  const newStock = selected && qtyValid ? selected.stockQty + change : null;

  async function submit(event) {
    event.preventDefault();
    const reason = form.reason === "Other" ? form.otherReason.trim() : form.reason;
    if (!qtyValid) {
      setMessage({ tone: "error", text: "Enter a whole number of 1 or more." });
      return;
    }
    if (!reason) {
      setMessage({ tone: "error", text: "Enter a reason for the change." });
      return;
    }
    if (newStock < 0) {
      setMessage({ tone: "error", text: `You can remove at most ${selected.stockQty}.` });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { variant } = await api.post(`/variants/${selected.id}/adjust-stock`, { qtyChange: change, reason });
      setSelected((current) => ({ ...current, stockQty: variant.stockQty }));
      setForm((current) => ({ ...current, qty: "", otherReason: "" }));
      setMessage({ tone: "success", text: `Stock for ${label(selected)} is now ${variant.stockQty}.` });
      history.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock adjustments"
        description="Correct stock for damage, miscounts, theft or deliveries. Every change is logged with who made it and why."
      />

      <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <section className={`space-y-4 p-5 ${cardClass}`} aria-label="Adjust stock">
          <div className="space-y-1">
            <label htmlFor="variant-search" className={labelClass}>Find an item</label>
            <input
              id="variant-search"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, brand, SKU or barcode"
              className={inputClass}
            />
          </div>

          {term && (
            <div className="max-h-64 overflow-y-auto rounded-md ring-1 ring-slate-200">
              {!searchIsCurrent ? (
                <p className="px-3 py-4 text-sm text-slate-500">Searching…</p>
              ) : search.error ? (
                <p className="px-3 py-4 text-sm text-red-700">Search failed: {search.error}</p>
              ) : search.items.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No items match &ldquo;{term}&rdquo;.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {search.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => choose(item)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span>
                          <span className="font-medium text-slate-900">{item.name}</span>{" "}
                          <span className="text-slate-600">{item.size} / {item.color}</span>
                          <span className="block font-mono text-xs text-slate-500">{item.sku}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-600">{item.stockQty} in stock</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          {selected ? (
            <form onSubmit={submit} className="space-y-4 border-t border-slate-200 pt-4" noValidate>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{selected.name}</p>
                  <p className="text-sm text-slate-600">{selected.size} / {selected.color}</p>
                  <p className="font-mono text-xs text-slate-500">{selected.sku}</p>
                  <Link href={`/admin/products/${selected.productId}`} className="text-xs text-slate-500 underline">
                    Open product
                  </Link>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">In stock</p>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">{selected.stockQty}</p>
                </div>
              </div>

              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">Add or remove stock</legend>
                {[
                  { value: "add", text: "Add stock" },
                  { value: "remove", text: "Remove stock" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-md py-2 text-center text-sm ring-1 ${
                      form.direction === option.value
                        ? "bg-slate-900 text-white ring-slate-900"
                        : "text-slate-700 ring-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="direction"
                      value={option.value}
                      checked={form.direction === option.value}
                      onChange={setField("direction")}
                      className="sr-only"
                    />
                    {option.text}
                  </label>
                ))}
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="adjust-qty" className={labelClass}>Quantity</label>
                  <input id="adjust-qty" inputMode="numeric" value={form.qty} onChange={setField("qty")} placeholder="1" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="adjust-reason" className={labelClass}>Reason</label>
                  <select id="adjust-reason" value={form.reason} onChange={setField("reason")} className={inputClass}>
                    {REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.reason === "Other" && (
                <div className="space-y-1">
                  <label htmlFor="adjust-other" className={labelClass}>Describe the reason</label>
                  <input id="adjust-other" value={form.otherReason} onChange={setField("otherReason")} maxLength={200} className={inputClass} />
                </div>
              )}

              {newStock !== null && (
                <p className={`text-sm ${newStock < 0 ? "text-red-600" : "text-slate-600"}`}>
                  {newStock < 0
                    ? `Only ${selected.stockQty} in stock, so you cannot remove ${qty}.`
                    : `Stock will change from ${selected.stockQty} to ${newStock}.`}
                </p>
              )}

              <div className="flex gap-2">
                <button type="submit" disabled={saving || newStock === null || newStock < 0} className={buttonClass.primary}>
                  {saving ? "Saving…" : "Save adjustment"}
                </button>
                <button type="button" onClick={() => setSelected(null)} disabled={saving} className={buttonClass.secondary}>
                  Choose another item
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Search for an item to adjust its stock.</p>
          )}
        </section>

        <section className={`overflow-hidden ${cardClass}`} aria-labelledby="history-title">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 id="history-title" className="font-semibold text-slate-900">
              {selected ? `History for ${label(selected)}` : "Recent adjustments"}
            </h2>
          </div>
          {history.error && <Alert className="m-4">Could not load history: {history.error.message}</Alert>}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  {!selected && <th scope="col" className="px-4 py-3">Item</th>}
                  <th scope="col" className="px-4 py-3 text-right">Change</th>
                  <th scope="col" className="px-4 py-3">Reason</th>
                  <th scope="col" className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.loading && !history.data ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                ) : (history.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No adjustments yet.</td></tr>
                ) : (
                  history.data.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(row.createdAt)}</td>
                      {!selected && (
                        <td className="px-4 py-2">
                          <span className="text-slate-900">{row.variant.productName}</span>{" "}
                          <span className="text-slate-500">{row.variant.size} / {row.variant.color}</span>
                        </td>
                      )}
                      <td className={`px-4 py-2 text-right font-medium tabular-nums ${row.qtyChange > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {row.qtyChange > 0 ? `+${row.qtyChange}` : row.qtyChange}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{row.reason}</td>
                      <td className="px-4 py-2 text-slate-600">{row.user.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
