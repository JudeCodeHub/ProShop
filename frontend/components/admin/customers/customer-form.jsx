"use client";

import { useState } from "react";
import Alert from "@/components/admin/alert";
import { api } from "@/lib/api";
import { buttonClass, cardClass, inputClass, labelClass } from "@/lib/ui";

export default function CustomerForm({ customer, onSaved, onCancel }) {
  const isNew = !customer;
  const [values, setValues] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("Enter the customer's name.");
      return;
    }

    setSaving(true);
    setError("");
    const body = {
      name: values.name,
      ...(values.phone.trim() && { phone: values.phone }),
      ...(values.email.trim() && { email: values.email }),
    };

    try {
      const saved = isNew ? await api.post("/customers", body) : await api.put(`/customers/${customer.id}`, body);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`max-w-xl space-y-4 p-5 ${cardClass}`} noValidate>
      <h2 className="text-lg font-semibold text-slate-900">{isNew ? "New customer" : "Edit customer"}</h2>
      {error && <Alert>{error}</Alert>}

      <div className="space-y-1">
        <label htmlFor="customer-name" className={labelClass}>Name</label>
        <input id="customer-name" value={values.name} onChange={change("name")} maxLength={100} autoFocus className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="customer-phone" className={labelClass}>
            Phone <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input id="customer-phone" type="tel" value={values.phone} onChange={change("phone")} placeholder="077 123 4567" className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="customer-email" className={labelClass}>
            Email <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input id="customer-email" type="email" value={values.email} onChange={change("email")} maxLength={254} className={inputClass} />
        </div>
      </div>
      {!isNew && (
        <p className="text-xs text-slate-500">Leaving the phone or email empty removes it from the profile.</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={buttonClass.primary}>
          {saving ? "Saving…" : isNew ? "Create customer" : "Save changes"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className={buttonClass.secondary}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
