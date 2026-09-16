"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { formatMoney, toCents } from "@/lib/money";
import {
  draftBody,
  draftTotals,
  hasDraftErrors,
  lineFrom,
  searchVariants,
  validateDraft,
  variantOptions,
} from "@/lib/purchase-orders";
import { buttonClass, cardClass, fieldAria, fieldClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

export default function PurchaseOrderForm() {
  const router = useRouter();
  const suppliers = useApi("/suppliers");
  const products = useApi("/products");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";

  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({ lines: {} });
  const [error, setError] = useState("");

  const options = useMemo(() => variantOptions(products.data ?? []), [products.data]);
  const matches = useMemo(
    () => searchVariants(options, search, lines.map((line) => line.variantId)),
    [options, search, lines],
  );
  const totals = draftTotals(lines);

  function addLine(option) {
    setLines((current) => [...current, lineFrom(option)]);
    setSearch("");
    setError("");
    setErrors((current) => ({ ...current, form: undefined }));
  }

  const updateLine = (variantId, key, value) => {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, [key]: value } : line)),
    );
    setErrors((current) => {
      const lineErrors = current.lines[variantId];
      if (!lineErrors?.[key]) {
        return current;
      }
      return {
        ...current,
        lines: { ...current.lines, [variantId]: { ...lineErrors, [key]: undefined } },
      };
    });
  };

  const removeLine = (variantId) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
    setErrors((current) => {
      const { [variantId]: removed, ...rest } = current.lines;
      return { ...current, lines: rest };
    });
  };

  async function submit(event) {
    event.preventDefault();
    const found = validateDraft({ supplierId, lines });
    setErrors(found);
    if (hasDraftErrors(found)) {
      setError(found.form ?? "Please fix the marked fields.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const order = await api.post("/purchase-orders", draftBody({ supplierId, lines }));
      router.push(`/admin/purchase-orders/${order.id}`);
    } catch (apiError) {
      setError(apiError.message);
      setSaving(false);
    }
  }

  const supplierList = suppliers.data ?? [];

  return (
    <form onSubmit={submit} className="max-w-4xl" noValidate>
      <PageHeader
        title="New purchase order"
        description="Choose a supplier, add the products you ordered and save. Stock changes only when you mark it as received."
        back={{ href: "/admin/purchase-orders", label: "Purchase orders" }}
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {products.error && <Alert className="mb-4">Could not load products: {products.error.message}</Alert>}

      <div className={`mb-4 p-4 ${cardClass}`}>
        <label htmlFor="po-supplier" className={labelClass}>Supplier</label>
        {supplierList.length === 0 && !suppliers.loading ? (
          <p className="mt-1 text-sm text-slate-600">
            You have no suppliers yet.{" "}
            <Link href="/admin/suppliers" className="font-medium text-slate-900 hover:underline">Add a supplier</Link>{" "}
            first.
          </p>
        ) : (
          <select
            id="po-supplier"
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setErrors((current) => ({ ...current, supplierId: undefined }));
            }}
            className={`mt-1 max-w-sm ${fieldClass(errors.supplierId)}`}
            {...fieldAria("po-supplier", errors.supplierId)}
          >
            <option value="">Choose a supplier</option>
            {supplierList.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        )}
        {errors.supplierId && (
          <p id="po-supplier-error" role="alert" className="mt-1 text-xs text-red-700">{errors.supplierId}</p>
        )}
      </div>

      <div className={`mb-4 p-4 ${cardClass}`}>
        <label htmlFor="po-search" className={labelClass}>Add products</label>
        <input
          id="po-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by product, brand, SKU or barcode"
          className={`mt-1 ${inputClass}`}
        />
        {search.trim() && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No product matches, or it is already on this order.</li>
            ) : (
              matches.map((option) => (
                <li key={option.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{option.productName}</span>
                    <span className="text-slate-600"> · {option.size} · {option.color}</span>
                    <span className="block text-xs text-slate-500">{option.sku} · in stock {option.stockQty}</span>
                  </span>
                  <button type="button" onClick={() => addLine(option)} className={buttonClass.small}>Add</button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Product</th>
              <th scope="col" className="px-4 py-3 text-right">Quantity</th>
              <th scope="col" className="px-4 py-3 text-right">Cost each</th>
              <th scope="col" className="px-4 py-3 text-right">Line total</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No products added yet.</td></tr>
            ) : (
              lines.map((line) => {
                const qty = /^\d+$/.test(line.qty.trim()) ? Number(line.qty.trim()) : null;
                const costCents = toCents(line.costPrice || 0);
                const lineErrors = errors.lines[line.variantId] ?? {};
                const lineTotal =
                  qty === null || !/^\d+(\.\d{1,2})?$/.test(line.costPrice.trim())
                    ? "—"
                    : formatMoney(qty * costCents, currency);
                return (
                  <tr key={line.variantId}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{line.label}</span>
                      <span className="block text-xs text-slate-500">{line.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <label htmlFor={`qty-${line.variantId}`} className="sr-only">Quantity for {line.label}</label>
                      <input
                        id={`qty-${line.variantId}`}
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(event) => updateLine(line.variantId, "qty", event.target.value)}
                        className={`${fieldClass(lineErrors.qty)} w-24 text-right`}
                        {...fieldAria(`qty-${line.variantId}`, lineErrors.qty)}
                      />
                      {lineErrors.qty && (
                        <p id={`qty-${line.variantId}-error`} role="alert" className="mt-1 text-xs text-red-700">
                          {lineErrors.qty}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <label htmlFor={`cost-${line.variantId}`} className="sr-only">Cost price for {line.label}</label>
                      <input
                        id={`cost-${line.variantId}`}
                        inputMode="decimal"
                        value={line.costPrice}
                        onChange={(event) => updateLine(line.variantId, "costPrice", event.target.value)}
                        className={`${fieldClass(lineErrors.costPrice)} w-28 text-right`}
                        {...fieldAria(`cost-${line.variantId}`, lineErrors.costPrice)}
                      />
                      {lineErrors.costPrice && (
                        <p id={`cost-${line.variantId}-error`} role="alert" className="mt-1 text-xs text-red-700">
                          {lineErrors.costPrice}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{lineTotal}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => removeLine(line.variantId)} className={buttonClass.smallDanger}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {totals.totalQty} item{totals.totalQty === 1 ? "" : "s"} ·{" "}
          <span className="font-medium text-slate-900">
            {totals.hasInvalidLine ? "—" : formatMoney(totals.totalCostCents, currency)}
          </span>
        </p>
        <div className="flex gap-2">
          <Link href="/admin/purchase-orders" className={buttonClass.secondary}>Cancel</Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving ? "Saving…" : "Create purchase order"}
          </button>
        </div>
      </div>
    </form>
  );
}
