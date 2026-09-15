"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import { api } from "@/lib/api";
import { parseAmount } from "@/lib/money";
import { buttonClass, cardClass, inputClass, labelClass } from "@/lib/ui";

const toValues = (product) => ({
  name: product?.name ?? "",
  categoryId: product ? String(product.categoryId) : "",
  brand: product?.brand ?? "",
  costPrice: product ? Number(product.costPrice).toFixed(2) : "",
});

export default function ProductForm({ product, categories, onSaved }) {
  const router = useRouter();
  const isNew = !product;
  const [values, setValues] = useState(() => toValues(product));
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!values.name.trim() || !values.categoryId || !values.brand.trim() || !values.costPrice.trim()) {
      setMessage({ tone: "error", text: "Fill in the name, category, brand and cost price." });
      return;
    }
    const cost = parseAmount(values.costPrice);
    if (cost === null) {
      setMessage({ tone: "error", text: "Cost price must be a number with up to 2 decimals." });
      return;
    }

    setBusy("save");
    setMessage(null);
    const body = {
      name: values.name,
      categoryId: Number(values.categoryId),
      brand: values.brand,
      costPrice: cost / 100,
    };

    try {
      if (isNew) {
        const created = await api.post("/products", body);
        router.replace(`/admin/products/${created.id}`);
        return;
      }
      const saved = await api.put(`/products/${product.id}`, body);
      setValues(toValues(saved));
      setMessage({ tone: "success", text: "Product saved." });
      onSaved?.();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    }
    setBusy(null);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${product.name}" and all its variants? This cannot be undone.`)) {
      return;
    }
    setBusy("delete");
    setMessage(null);
    try {
      await api.delete(`/products/${product.id}`);
      router.push("/admin/products");
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      setBusy(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 p-5 ${cardClass}`} noValidate>
      <h2 className="text-lg font-semibold text-slate-900">Details</h2>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="product-name" className={labelClass}>Name</label>
          <input id="product-name" value={values.name} onChange={change("name")} maxLength={150} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="product-category" className={labelClass}>Category</label>
          <select id="product-category" value={values.categoryId} onChange={change("categoryId")} className={inputClass}>
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="product-brand" className={labelClass}>Brand</label>
          <input id="product-brand" value={values.brand} onChange={change("brand")} maxLength={100} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="product-cost" className={labelClass}>Cost price</label>
          <input
            id="product-cost"
            inputMode="decimal"
            placeholder="0.00"
            value={values.costPrice}
            onChange={change("costPrice")}
            className={inputClass}
          />
          <p className="text-xs text-slate-500">What the shop pays per unit. Used for profit reports.</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <button type="submit" disabled={Boolean(busy)} className={buttonClass.primary}>
          {busy === "save" ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </button>
        {!isNew && (
          <button type="button" onClick={handleDelete} disabled={Boolean(busy)} className={buttonClass.danger}>
            {busy === "delete" ? "Deleting…" : "Delete product"}
          </button>
        )}
      </div>
    </form>
  );
}
