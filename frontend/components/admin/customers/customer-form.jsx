"use client";

import { useState } from "react";
import Alert from "@/components/admin/alert";
import Field from "@/components/admin/field";
import { api } from "@/lib/api";
import { buttonClass, cardClass, fieldAria, fieldClass } from "@/lib/ui";
import { validateCustomer } from "@/lib/validation";

export default function CustomerForm({ customer, onSaved, onCancel }) {
  const isNew = !customer;
  const [values, setValues] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const change = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validateCustomer(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError("Please fix the marked fields.");
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

      <Field id="customer-name" label="Name" error={errors.name}>
        <input
          id="customer-name"
          value={values.name}
          onChange={change("name")}
          maxLength={100}
          autoFocus
          className={fieldClass(errors.name)}
          {...fieldAria("customer-name", errors.name)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="customer-phone" label="Phone" optional error={errors.phone}>
          <input
            id="customer-phone"
            type="tel"
            value={values.phone}
            onChange={change("phone")}
            placeholder="077 123 4567"
            className={fieldClass(errors.phone)}
            {...fieldAria("customer-phone", errors.phone)}
          />
        </Field>
        <Field id="customer-email" label="Email" optional error={errors.email}>
          <input
            id="customer-email"
            type="email"
            value={values.email}
            onChange={change("email")}
            maxLength={254}
            className={fieldClass(errors.email)}
            {...fieldAria("customer-email", errors.email)}
          />
        </Field>
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
