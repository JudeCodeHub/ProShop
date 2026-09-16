"use client";

import Link from "next/link";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { buttonClass, cardClass, inputClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";
import { textError } from "@/lib/validation";

export default function CategoriesManager() {
  const categories = useApi("/categories");
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState("");
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const list = categories.data ?? [];

  async function run(action, successText) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
      categories.reload();
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    const name = newName.trim();
    const problem = textError(newName, { label: "a category name", max: 60 });
    setNameError(problem);
    if (problem) {
      return;
    }
    if (await run(() => api.post("/categories", { name }), `Added "${name}".`)) {
      setNewName("");
    }
  }

  async function saveRename(event) {
    event.preventDefault();
    const name = editing.name.trim();
    const problem = textError(editing.name, { label: "a category name", max: 60 });
    if (problem) {
      setEditing((current) => ({ ...current, error: problem }));
      return;
    }
    if (await run(() => api.put(`/categories/${editing.id}`, { name }), `Renamed to "${name}".`)) {
      setEditing(null);
    }
  }

  function startDelete(category) {
    setEditing(null);
    if (category.productCount > 0) {
      setMoving({ category, moveTo: "" });
      return;
    }
    if (window.confirm(`Delete the "${category.name}" category?`)) {
      run(() => api.delete(`/categories/${category.id}`), `Deleted "${category.name}".`);
    }
  }

  async function moveAndDelete(event) {
    event.preventDefault();
    const target = list.find((c) => c.id === Number(moving.moveTo));
    if (!target) {
      setMessage({ tone: "error", text: "Choose the category to move the products to." });
      return;
    }
    const { category } = moving;
    const done = await run(
      () => api.delete(`/categories/${category.id}?moveTo=${target.id}`),
      `Moved ${category.productCount} product${category.productCount === 1 ? "" : "s"} to "${target.name}" and deleted "${category.name}".`,
    );
    if (done) {
      setMoving(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Categories" description="Group products into categories like Footwear, Apparel or Equipment." />

      <form onSubmit={addCategory} className="mb-4" noValidate>
        <div className="flex gap-2">
          <label htmlFor="new-category" className="sr-only">New category name</label>
          <input
            id="new-category"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNameError("");
            }}
            maxLength={60}
            placeholder="New category name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "new-category-error" : undefined}
            className={nameError ? `${inputClass} border-red-400` : inputClass}
          />
          <button type="submit" disabled={busy} className={`${buttonClass.primary} shrink-0`}>
            Add category
          </button>
        </div>
        {nameError && <p id="new-category-error" role="alert" className="mt-1 text-xs text-red-700">{nameError}</p>}
      </form>

      {message && <Alert tone={message.tone} className="mb-4">{message.text}</Alert>}
      {categories.error && <Alert className="mb-4">Could not load categories: {categories.error.message}</Alert>}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3 text-right">Products</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.loading && !categories.data ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Loading categories…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No categories yet. Add the first one above.</td></tr>
            ) : (
              list.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  others={list.filter((c) => c.id !== category.id)}
                  editing={editing?.id === category.id ? editing : null}
                  moving={moving?.category.id === category.id ? moving : null}
                  busy={busy}
                  onEdit={() => {
                    setMoving(null);
                    setEditing({ id: category.id, name: category.name });
                  }}
                  onEditChange={(name) => setEditing((current) => ({ ...current, name, error: "" }))}
                  onEditSave={saveRename}
                  onEditCancel={() => setEditing(null)}
                  onDelete={() => startDelete(category)}
                  onMoveChange={(moveTo) => setMoving((current) => ({ ...current, moveTo }))}
                  onMoveConfirm={moveAndDelete}
                  onMoveCancel={() => setMoving(null)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  others,
  editing,
  moving,
  busy,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onMoveChange,
  onMoveConfirm,
  onMoveCancel,
}) {
  return (
    <>
      <tr>
        <td className="px-4 py-3">
          {editing ? (
            <form onSubmit={onEditSave} noValidate>
              <div className="flex gap-2">
                <label htmlFor={`rename-${category.id}`} className="sr-only">Category name</label>
                <input
                  id={`rename-${category.id}`}
                  value={editing.name}
                  onChange={(event) => onEditChange(event.target.value)}
                  maxLength={60}
                  autoFocus
                  aria-invalid={editing.error ? true : undefined}
                  aria-describedby={editing.error ? `rename-${category.id}-error` : undefined}
                  className={`${inputClass.replace("px-3 py-2", "px-2 py-1")} ${editing.error ? "border-red-400" : ""}`}
                />
                <button type="submit" disabled={busy} className={buttonClass.small}>Save</button>
                <button type="button" onClick={onEditCancel} disabled={busy} className={buttonClass.small}>Cancel</button>
              </div>
              {editing.error && (
                <p id={`rename-${category.id}-error`} role="alert" className="mt-1 text-xs text-red-700">{editing.error}</p>
              )}
            </form>
          ) : (
            <span className="font-medium text-slate-900">{category.name}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {category.productCount > 0 ? (
            <Link href="/admin/products" className="hover:underline">{category.productCount}</Link>
          ) : (
            <span className="text-slate-400">0</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          {!editing && (
            <>
              <button type="button" onClick={onEdit} disabled={busy} className={`${buttonClass.small} mr-1`}>Rename</button>
              <button type="button" onClick={onDelete} disabled={busy} className={buttonClass.smallDanger}>Delete</button>
            </>
          )}
        </td>
      </tr>
      {moving && (
        <tr className="bg-amber-50">
          <td colSpan={3} className="px-4 py-3">
            <form onSubmit={onMoveConfirm} className="flex flex-wrap items-center gap-2 text-sm" noValidate>
              <span className="text-amber-900">
                &ldquo;{category.name}&rdquo; has {category.productCount} product{category.productCount === 1 ? "" : "s"}. Move them to
              </span>
              {others.length === 0 ? (
                <span className="text-amber-900">
                  another category first. Add a category above, then try again.
                </span>
              ) : (
                <>
                  <label htmlFor={`move-${category.id}`} className="sr-only">Move products to</label>
                  <select
                    id={`move-${category.id}`}
                    value={moving.moveTo}
                    onChange={(event) => onMoveChange(event.target.value)}
                    className={`${inputClass} w-auto py-1`}
                  >
                    <option value="">Choose a category</option>
                    {others.map((other) => (
                      <option key={other.id} value={other.id}>{other.name}</option>
                    ))}
                  </select>
                  <button type="submit" disabled={busy} className={buttonClass.smallDanger}>Move and delete</button>
                </>
              )}
              <button type="button" onClick={onMoveCancel} disabled={busy} className={buttonClass.small}>Cancel</button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
