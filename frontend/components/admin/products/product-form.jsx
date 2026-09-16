"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import Field from "@/components/admin/field";
import { api } from "@/lib/api";
import { parseAmount } from "@/lib/money";
import { buttonClass, cardClass, fieldAria, fieldClass } from "@/lib/ui";
import { validateProduct } from "@/lib/validation";

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
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const change = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validateProduct(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage({ tone: "error", text: "Please fix the marked fields." });
      return;
    }

    setBusy("save");
    setMessage(null);
    const body = {
      name: values.name,
      categoryId: Number(values.categoryId),
      brand: values.brand,
      costPrice: parseAmount(values.costPrice) / 100,
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
        <Field id="product-name" label="Name" error={errors.name} className="sm:col-span-2">
          <input
            id="product-name"
            value={values.name}
            onChange={change("name")}
            maxLength={150}
            className={fieldClass(errors.name)}
            {...fieldAria("product-name", errors.name)}
          />
        </Field>
        <Field id="product-category" label="Category" error={errors.categoryId}>
          <select
            id="product-category"
            value={values.categoryId}
            onChange={change("categoryId")}
            className={fieldClass(errors.categoryId)}
            {...fieldAria("product-category", errors.categoryId)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="product-brand" label="Brand" error={errors.brand}>
          <input
            id="product-brand"
            value={values.brand}
            onChange={change("brand")}
            maxLength={100}
            className={fieldClass(errors.brand)}
            {...fieldAria("product-brand", errors.brand)}
          />
        </Field>
        <Field
          id="product-cost"
          label="Cost price"
          error={errors.costPrice}
          hint="What the shop pays per unit. Used for profit reports."
        >
          <input
            id="product-cost"
            inputMode="decimal"
            placeholder="0.00"
            value={values.costPrice}
            onChange={change("costPrice")}
            className={fieldClass(errors.costPrice)}
            {...fieldAria("product-cost", errors.costPrice)}
          />
        </Field>
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
