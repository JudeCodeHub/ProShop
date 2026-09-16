"use client";

import { useState } from "react";
import Alert from "@/components/admin/alert";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { settingsBody, settingsForm, validateSettings } from "@/lib/settings-form";
import { buttonClass, cardClass, fieldAria, fieldClass, inputClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const FIELDS = [
  { key: "storeName", label: "Store name", maxLength: 100, hint: "Shown at the top of every receipt." },
  { key: "address", label: "Address", maxLength: 300, hint: "Printed under the store name.", optional: true },
  { key: "logoUrl", label: "Logo link", maxLength: 500, hint: "A full link starting with https://", optional: true },
];

export default function SettingsForm() {
  const settings = useApi("/settings");
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const form = draft ?? (settings.data ? settingsForm(settings.data) : null);

  const setField = (key) => (event) => {
    const { value } = event.target;
    setDraft({ ...form, [key]: value });
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function save(event) {
    event.preventDefault();
    const found = validateSettings(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage({ tone: "error", text: "Please fix the marked fields." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.put("/settings", settingsBody(form));
      setDraft(settingsForm(saved));
      setMessage({ tone: "success", text: "Settings saved. New sales and receipts use them right away." });
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Store settings"
        description="Store details, tax and currency. Checkout and receipts read these values."
      />

      {message && <Alert tone={message.tone} className="mb-4">{message.text}</Alert>}
      {settings.error && <Alert className="mb-4">Could not load settings: {settings.error.message}</Alert>}

      {!form ? (
        <p className="text-sm text-slate-500">Loading settings…</p>
      ) : (
        <form onSubmit={save} className={`grid gap-4 p-4 ${cardClass}`} noValidate>
          {FIELDS.map((field) => (
            <Field
              key={field.key}
              id={field.key}
              label={field.label}
              error={errors[field.key]}
              hint={field.hint}
              optional={field.optional}
            >
              <input
                id={field.key}
                value={form[field.key]}
                onChange={setField(field.key)}
                maxLength={field.maxLength}
                className={fieldClass(errors[field.key])}
                {...fieldAria(field.key, errors[field.key])}
              />
            </Field>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="taxRate"
              label="Tax rate (%)"
              error={errors.taxRate}
              hint="Added on top of the price after any discount."
            >
              <input
                id="taxRate"
                inputMode="decimal"
                value={form.taxRate}
                onChange={setField("taxRate")}
                className={fieldClass(errors.taxRate)}
                {...fieldAria("taxRate", errors.taxRate)}
              />
            </Field>
            <Field id="currency" label="Currency" error={errors.currency} hint="A 3 letter code, for example LKR.">
              <input
                id="currency"
                value={form.currency}
                onChange={setField("currency")}
                maxLength={3}
                className={`uppercase ${fieldClass(errors.currency)}`}
                {...fieldAria("currency", errors.currency)}
              />
            </Field>
          </div>

          <Field
            id="receiptFooterText"
            label="Receipt footer"
            optional
            error={errors.receiptFooterText}
            hint="The last line on a receipt, such as your return policy."
          >
            <textarea
              id="receiptFooterText"
              value={form.receiptFooterText}
              onChange={setField("receiptFooterText")}
              maxLength={300}
              rows={3}
              className={fieldClass(errors.receiptFooterText)}
              {...fieldAria("receiptFooterText", errors.receiptFooterText)}
            />
          </Field>

          <div>
            <button type="submit" disabled={saving} className={buttonClass.primary}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
