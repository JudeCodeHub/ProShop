"use client";

import Link from "next/link";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import { api } from "@/lib/api";
import { formatMoney, parseAmount, toCents } from "@/lib/money";
import { buttonClass, cardClass, inputClass, tableHeadClass } from "@/lib/ui";

const EMPTY_NEW = { size: "", color: "", sellPrice: "", stockQty: "" };
const cell = "px-3 py-2";
const compactInput = inputClass.replace("px-3 py-2", "px-2 py-1");

export default function VariantManager({ productId, variants, currency, onChanged }) {
  const [draft, setDraft] = useState(EMPTY_NEW);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function run(key, action, successText) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
      onChanged();
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addVariant(event) {
    event.preventDefault();
    const size = draft.size.trim();
    const color = draft.color.trim();
    const price = parseAmount(draft.sellPrice);
    const stock = draft.stockQty.trim() === "" ? 0 : Number(draft.stockQty);

    if (!size || !color || !draft.sellPrice.trim()) {
      setMessage({ tone: "error", text: "Enter a size, a color and a selling price." });
      return;
    }
    if (price === null) {
      setMessage({ tone: "error", text: "Selling price must be a number with up to 2 decimals." });
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setMessage({ tone: "error", text: "Starting stock must be a whole number of 0 or more." });
      return;
    }

    const added = await run(
      "add",
      () => api.post(`/products/${productId}/variants`, { size, color, sellPrice: price / 100, stockQty: stock }),
      `Added ${size} / ${color}.`,
    );
    if (added) {
      setDraft(EMPTY_NEW);
    }
  }

  async function saveEdit() {
    const size = editing.size.trim();
    const color = editing.color.trim();
    const price = parseAmount(editing.sellPrice);
    if (!size || !color || !editing.sellPrice.trim() || price === null) {
      setMessage({ tone: "error", text: "Enter a size, a color and a selling price with up to 2 decimals." });
      return;
    }
    const saved = await run(
      `edit-${editing.id}`,
      () => api.put(`/variants/${editing.id}`, { size, color, sellPrice: price / 100 }),
      `Updated ${size} / ${color}.`,
    );
    if (saved) {
      setEditing(null);
    }
  }

  function deleteVariant(variant) {
    if (!window.confirm(`Delete the ${variant.size} / ${variant.color} variant?`)) {
      return;
    }
    run(`delete-${variant.id}`, () => api.delete(`/variants/${variant.id}`), `Deleted ${variant.size} / ${variant.color}.`);
  }

  const disabled = Boolean(busy);
  const editField = (key) => (event) => setEditing((current) => ({ ...current, [key]: event.target.value }));
  const draftField = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <section className={`space-y-4 p-5 ${cardClass}`} aria-labelledby="variants-title">
      <div>
        <h2 id="variants-title" className="text-lg font-semibold text-slate-900">Variants</h2>
        <p className="text-sm text-slate-600">
          Each size and color has its own SKU, barcode, price and stock. Change stock with{" "}
          <Link href="/admin/stock-adjustments" className="underline">stock adjustments</Link> so every change is logged.
        </p>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className={cell}>Size</th>
              <th scope="col" className={cell}>Color</th>
              <th scope="col" className={cell}>SKU</th>
              <th scope="col" className={cell}>Barcode</th>
              <th scope="col" className={`${cell} text-right`}>Price</th>
              <th scope="col" className={`${cell} text-right`}>Stock</th>
              <th scope="col" className={`${cell} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No variants yet. Add the first one below.</td>
              </tr>
            )}
            {variants.map((variant) =>
              editing?.id === variant.id ? (
                <tr key={variant.id} className="bg-slate-50">
                  <td className={cell}>
                    <input aria-label="Size" value={editing.size} onChange={editField("size")} maxLength={20} className={compactInput} />
                  </td>
                  <td className={cell}>
                    <input aria-label="Color" value={editing.color} onChange={editField("color")} maxLength={30} className={compactInput} />
                  </td>
                  <td className={`${cell} font-mono text-xs text-slate-500`}>new SKU on save</td>
                  <td className={`${cell} font-mono text-xs text-slate-600`}>{variant.barcode}</td>
                  <td className={cell}>
                    <input aria-label="Price" inputMode="decimal" value={editing.sellPrice} onChange={editField("sellPrice")} className={`${compactInput} text-right`} />
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{variant.stockQty}</td>
                  <td className={`${cell} whitespace-nowrap text-right`}>
                    <button type="button" onClick={saveEdit} disabled={disabled} className={`${buttonClass.small} mr-1`}>
                      {busy === `edit-${variant.id}` ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={disabled} className={buttonClass.small}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={variant.id}>
                  <td className={cell}>{variant.size}</td>
                  <td className={cell}>{variant.color}</td>
                  <td className={`${cell} font-mono text-xs text-slate-600`}>{variant.sku}</td>
                  <td className={`${cell} font-mono text-xs text-slate-600`}>{variant.barcode}</td>
                  <td className={`${cell} text-right tabular-nums`}>{formatMoney(toCents(variant.sellPrice), currency)}</td>
                  <td className={`${cell} text-right tabular-nums`}>
                    <span className={variant.stockQty === 0 ? "font-medium text-red-600" : ""}>{variant.stockQty}</span>{" "}
                    <Link
                      href={`/admin/stock-adjustments?barcode=${encodeURIComponent(variant.barcode)}`}
                      className="ml-1 text-xs text-slate-500 underline hover:text-slate-900"
                    >
                      Adjust
                    </Link>
                  </td>
                  <td className={`${cell} whitespace-nowrap text-right`}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setEditing({
                          id: variant.id,
                          size: variant.size,
                          color: variant.color,
                          sellPrice: Number(variant.sellPrice).toFixed(2),
                        })
                      }
                      className={`${buttonClass.small} mr-1`}
                    >
                      Edit
                    </button>
                    <button type="button" disabled={disabled} onClick={() => deleteVariant(variant)} className={buttonClass.smallDanger}>
                      {busy === `delete-${variant.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={addVariant} className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end" noValidate>
        <div className="space-y-1">
          <label htmlFor="new-size" className="text-xs font-medium text-slate-600">Size</label>
          <input id="new-size" value={draft.size} onChange={draftField("size")} maxLength={20} placeholder="42 or M" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-color" className="text-xs font-medium text-slate-600">Color</label>
          <input id="new-color" value={draft.color} onChange={draftField("color")} maxLength={30} placeholder="Black" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-price" className="text-xs font-medium text-slate-600">Selling price</label>
          <input id="new-price" inputMode="decimal" value={draft.sellPrice} onChange={draftField("sellPrice")} placeholder="0.00" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-stock" className="text-xs font-medium text-slate-600">Starting stock</label>
          <input id="new-stock" inputMode="numeric" value={draft.stockQty} onChange={draftField("stockQty")} placeholder="0" className={inputClass} />
        </div>
        <button type="submit" disabled={disabled} className={buttonClass.primary}>
          {busy === "add" ? "Adding…" : "Add variant"}
        </button>
      </form>
    </section>
  );
}
