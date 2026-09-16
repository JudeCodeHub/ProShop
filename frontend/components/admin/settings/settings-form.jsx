"use client";

import { useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { settingsBody, settingsForm, validateSettings } from "@/lib/settings-form";
import { buttonClass, cardClass, inputClass, labelClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const FIELDS = [
  { key: "storeName", label: "Store name", maxLength: 100, hint: "Shown at the top of every receipt." },
  { key: "address", label: "Address", maxLength: 300, hint: "Printed under the store name." },
  { key: "logoUrl", label: "Logo link", maxLength: 500, hint: "Optional. A full link starting with https://" },
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
            <div key={field.key}>
              <label htmlFor={field.key} className={labelClass}>{field.label}</label>
              <input
                id={field.key}
                value={form[field.key]}
                onChange={setField(field.key)}
                maxLength={field.maxLength}
                className={`mt-1 ${inputClass}`}
              />
              {errors[field.key] ? (
                <p className="mt-1 text-xs text-red-700">{errors[field.key]}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{field.hint}</p>
              )}
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="taxRate" className={labelClass}>Tax rate (%)</label>
              <input
                id="taxRate"
                inputMode="decimal"
                value={form.taxRate}
                onChange={setField("taxRate")}
                className={`mt-1 ${inputClass}`}
              />
              {errors.taxRate ? (
                <p className="mt-1 text-xs text-red-700">{errors.taxRate}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Added on top of the price after any discount.</p>
              )}
            </div>
            <div>
              <label htmlFor="currency" className={labelClass}>Currency</label>
              <input
                id="currency"
                value={form.currency}
                onChange={setField("currency")}
                maxLength={3}
                className={`mt-1 uppercase ${inputClass}`}
              />
              {errors.currency ? (
                <p className="mt-1 text-xs text-red-700">{errors.currency}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">A 3 letter code, for example LKR.</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="receiptFooterText" className={labelClass}>Receipt footer</label>
            <textarea
              id="receiptFooterText"
              value={form.receiptFooterText}
              onChange={setField("receiptFooterText")}
              maxLength={300}
              rows={3}
              className={`mt-1 ${inputClass}`}
            />
            {errors.receiptFooterText ? (
              <p className="mt-1 text-xs text-red-700">{errors.receiptFooterText}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">The last line on a receipt, such as your return policy.</p>
            )}
          </div>

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
