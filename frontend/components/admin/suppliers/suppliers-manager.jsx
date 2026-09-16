"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { filterSuppliers, supplierBody, validateSupplier } from "@/lib/suppliers";
import { buttonClass, cardClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const EMPTY_FORM = { name: "", contactInfo: "" };

export default function SuppliersManager() {
  const suppliers = useApi("/suppliers");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const list = suppliers.data ?? [];
  const rows = useMemo(() => filterSuppliers(suppliers.data ?? [], search), [suppliers.data, search]);

  async function run(action, successText) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
      suppliers.reload();
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSupplier(event) {
    event.preventDefault();
    const problem = validateSupplier(form);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    if (await run(() => api.post("/suppliers", supplierBody(form)), `Added "${form.name.trim()}".`)) {
      setForm(EMPTY_FORM);
      setAdding(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    const problem = validateSupplier(editing);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    if (
      await run(
        () => api.put(`/suppliers/${editing.id}`, supplierBody(editing)),
        `Saved "${editing.name.trim()}".`,
      )
    ) {
      setEditing(null);
    }
  }

  function deleteSupplier(supplier) {
    setEditing(null);
    if (supplier.purchaseOrderCount > 0) {
      setMessage({
        tone: "error",
        text: `"${supplier.name}" has ${supplier.purchaseOrderCount} purchase order${supplier.purchaseOrderCount === 1 ? "" : "s"} and cannot be deleted.`,
      });
      return;
    }
    if (window.confirm(`Delete the supplier "${supplier.name}"?`)) {
      run(() => api.delete(`/suppliers/${supplier.id}`), `Deleted "${supplier.name}".`);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Suppliers"
        description="The vendors you buy stock from. Purchase orders are made against a supplier."
        actions={
          <button
            type="button"
            onClick={() => {
              setAdding((open) => !open);
              setForm(EMPTY_FORM);
              setEditing(null);
            }}
            className={buttonClass.primary}
          >
            {adding ? "Cancel" : "Add supplier"}
          </button>
        }
      />

      {adding && (
        <form onSubmit={addSupplier} className={`mb-4 grid gap-3 p-4 sm:grid-cols-2 ${cardClass}`} noValidate>
          <div>
            <label htmlFor="supplier-name" className={labelClass}>Name</label>
            <input
              id="supplier-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={100}
              autoFocus
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="supplier-contact" className={labelClass}>Contact details</label>
            <input
              id="supplier-contact"
              value={form.contactInfo}
              onChange={(event) => setForm({ ...form, contactInfo: event.target.value })}
              maxLength={500}
              placeholder="Phone, email or address"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={buttonClass.primary}>Save supplier</button>
          </div>
        </form>
      )}

      {message && <Alert tone={message.tone} className="mb-4">{message.text}</Alert>}
      {suppliers.error && <Alert className="mb-4">Could not load suppliers: {suppliers.error.message}</Alert>}

      <input
        type="search"
        aria-label="Search suppliers"
        placeholder="Search by name or contact details"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={`mb-4 ${inputClass}`}
      />

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Contact details</th>
              <th scope="col" className="px-4 py-3 text-right">Purchase orders</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.loading && !suppliers.data ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading suppliers…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  {list.length === 0 ? "No suppliers yet. Add the first one." : "No supplier matches your search."}
                </td>
              </tr>
            ) : (
              rows.map((supplier) =>
                editing?.id === supplier.id ? (
                  <tr key={supplier.id} className="bg-slate-50">
                    <td colSpan={4} className="px-4 py-3">
                      <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-2" noValidate>
                        <div className="min-w-48 flex-1">
                          <label htmlFor={`edit-name-${supplier.id}`} className={labelClass}>Name</label>
                          <input
                            id={`edit-name-${supplier.id}`}
                            value={editing.name}
                            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                            maxLength={100}
                            autoFocus
                            className={`mt-1 ${inputClass}`}
                          />
                        </div>
                        <div className="min-w-48 flex-1">
                          <label htmlFor={`edit-contact-${supplier.id}`} className={labelClass}>Contact details</label>
                          <input
                            id={`edit-contact-${supplier.id}`}
                            value={editing.contactInfo}
                            onChange={(event) => setEditing({ ...editing, contactInfo: event.target.value })}
                            maxLength={500}
                            className={`mt-1 ${inputClass}`}
                          />
                        </div>
                        <button type="submit" disabled={busy} className={buttonClass.primary}>Save</button>
                        <button type="button" onClick={() => setEditing(null)} disabled={busy} className={buttonClass.secondary}>
                          Cancel
                        </button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={supplier.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{supplier.name}</td>
                    <td className="px-4 py-3 text-slate-600">{supplier.contactInfo || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {supplier.purchaseOrderCount > 0 ? (
                        <Link href={`/admin/purchase-orders?supplierId=${supplier.id}`} className="hover:underline">
                          {supplier.purchaseOrderCount}
                        </Link>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setMessage(null);
                          setEditing({ id: supplier.id, name: supplier.name, contactInfo: supplier.contactInfo ?? "" });
                        }}
                        disabled={busy}
                        className={`${buttonClass.small} mr-1`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSupplier(supplier)}
                        disabled={busy}
                        className={buttonClass.smallDanger}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
