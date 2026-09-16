"use client";

import { useMemo, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/dates";
import {
  canDeactivate,
  filterUsers,
  newUserBody,
  ROLE_LABELS,
  ROLES,
  validateNewUser,
  validatePassword,
} from "@/lib/users";
import { buttonClass, cardClass, inputClass, labelClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const EMPTY_FORM = { name: "", email: "", password: "", role: "cashier" };

export default function UsersManager() {
  const { user: currentUser } = useAuth();
  const users = useApi("/users");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const list = users.data ?? [];
  const rows = useMemo(() => filterUsers(users.data ?? [], search), [users.data, search]);

  async function run(action, successText) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
      users.reload();
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addUser(event) {
    event.preventDefault();
    const problem = validateNewUser(form);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    if (
      await run(
        () => api.post("/users", newUserBody(form)),
        `Added ${form.name.trim()} as ${ROLE_LABELS[form.role].toLowerCase()}.`,
      )
    ) {
      setForm(EMPTY_FORM);
      setAdding(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    const name = editing.name.trim();
    if (!name) {
      setMessage({ tone: "error", text: "Enter a name." });
      return;
    }
    if (await run(() => api.put(`/users/${editing.id}`, { name, role: editing.role }), `Saved ${name}.`)) {
      setEditing(null);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    const problem = validatePassword(resetting.password);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    if (
      await run(
        () => api.post(`/users/${resetting.id}/reset-password`, { password: resetting.password }),
        `New password set for ${resetting.name}. Tell them the new password.`,
      )
    ) {
      setResetting(null);
    }
  }

  function toggleActive(user) {
    setEditing(null);
    setResetting(null);
    if (user.isActive) {
      const blocked = canDeactivate(user, currentUser?.id, list);
      if (blocked) {
        setMessage({ tone: "error", text: blocked });
        return;
      }
      if (!window.confirm(`Deactivate ${user.name}? They will not be able to sign in.`)) {
        return;
      }
      run(() => api.post(`/users/${user.id}/deactivate`), `${user.name} can no longer sign in.`);
      return;
    }
    run(() => api.post(`/users/${user.id}/activate`), `${user.name} can sign in again.`);
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Users"
        description="Staff accounts. Cashiers can use the POS, admins can use everything."
        actions={
          <button
            type="button"
            onClick={() => {
              setAdding((open) => !open);
              setForm(EMPTY_FORM);
              setEditing(null);
              setResetting(null);
            }}
            className={buttonClass.primary}
          >
            {adding ? "Cancel" : "Add user"}
          </button>
        }
      />

      {adding && (
        <form onSubmit={addUser} className={`mb-4 grid gap-3 p-4 sm:grid-cols-2 ${cardClass}`} noValidate>
          <div>
            <label htmlFor="user-name" className={labelClass}>Name</label>
            <input
              id="user-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={100}
              autoFocus
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="user-email" className={labelClass}>Email</label>
            <input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              maxLength={254}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="user-password" className={labelClass}>Password</label>
            <input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              maxLength={72}
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters. Share it with the staff member.</p>
          </div>
          <div>
            <label htmlFor="user-role" className={labelClass}>Role</label>
            <select
              id="user-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className={`mt-1 ${inputClass}`}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={buttonClass.primary}>Create user</button>
          </div>
        </form>
      )}

      {message && <Alert tone={message.tone} className="mb-4">{message.text}</Alert>}
      {users.error && <Alert className="mb-4">Could not load users: {users.error.message}</Alert>}

      <input
        type="search"
        aria-label="Search users"
        placeholder="Search by name, email or role"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={`mb-4 ${inputClass}`}
      />

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Email</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Added</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.loading && !users.data ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading users…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No user matches your search.</td></tr>
            ) : (
              rows.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser?.id}
                  busy={busy}
                  editing={editing?.id === user.id ? editing : null}
                  resetting={resetting?.id === user.id ? resetting : null}
                  onEdit={() => {
                    setResetting(null);
                    setMessage(null);
                    setEditing({ id: user.id, name: user.name, role: user.role });
                  }}
                  onEditChange={(changes) => setEditing((current) => ({ ...current, ...changes }))}
                  onEditSave={saveEdit}
                  onEditCancel={() => setEditing(null)}
                  onResetStart={() => {
                    setEditing(null);
                    setMessage(null);
                    setResetting({ id: user.id, name: user.name, password: "" });
                  }}
                  onResetChange={(password) => setResetting((current) => ({ ...current, password }))}
                  onResetSave={savePassword}
                  onResetCancel={() => setResetting(null)}
                  onToggleActive={() => toggleActive(user)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  busy,
  editing,
  resetting,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onResetStart,
  onResetChange,
  onResetSave,
  onResetCancel,
  onToggleActive,
}) {
  return (
    <>
      <tr className={user.isActive ? undefined : "bg-slate-50 text-slate-500"}>
        <td className="px-4 py-3 font-medium text-slate-900">
          {user.name}
          {isSelf && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
        </td>
        <td className="px-4 py-3">{user.email}</td>
        <td className="px-4 py-3">{ROLE_LABELS[user.role] ?? user.role}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
              user.isActive
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-slate-100 text-slate-600 ring-slate-300"
            }`}
          >
            {user.isActive ? "Active" : "Deactivated"}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3">{formatDateTime(user.createdAt)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <button type="button" onClick={onEdit} disabled={busy} className={`${buttonClass.small} mr-1`}>Edit</button>
          <button type="button" onClick={onResetStart} disabled={busy} className={`${buttonClass.small} mr-1`}>
            Reset password
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={busy || (isSelf && user.isActive)}
            className={user.isActive ? buttonClass.smallDanger : buttonClass.small}
          >
            {user.isActive ? "Deactivate" : "Activate"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-4 py-3">
            <form onSubmit={onEditSave} className="flex flex-wrap items-end gap-2" noValidate>
              <div className="min-w-48 flex-1">
                <label htmlFor={`edit-name-${user.id}`} className={labelClass}>Name</label>
                <input
                  id={`edit-name-${user.id}`}
                  value={editing.name}
                  onChange={(event) => onEditChange({ name: event.target.value })}
                  maxLength={100}
                  autoFocus
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label htmlFor={`edit-role-${user.id}`} className={labelClass}>Role</label>
                <select
                  id={`edit-role-${user.id}`}
                  value={editing.role}
                  onChange={(event) => onEditChange({ role: event.target.value })}
                  className={`mt-1 ${inputClass}`}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={busy} className={buttonClass.primary}>Save</button>
              <button type="button" onClick={onEditCancel} disabled={busy} className={buttonClass.secondary}>Cancel</button>
            </form>
          </td>
        </tr>
      )}
      {resetting && (
        <tr className="bg-amber-50">
          <td colSpan={6} className="px-4 py-3">
            <form onSubmit={onResetSave} className="flex flex-wrap items-end gap-2" noValidate>
              <div className="min-w-48 flex-1">
                <label htmlFor={`reset-${user.id}`} className={labelClass}>New password for {user.name}</label>
                <input
                  id={`reset-${user.id}`}
                  type="password"
                  value={resetting.password}
                  onChange={(event) => onResetChange(event.target.value)}
                  maxLength={72}
                  autoFocus
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <button type="submit" disabled={busy} className={buttonClass.primary}>Set password</button>
              <button type="button" onClick={onResetCancel} disabled={busy} className={buttonClass.secondary}>Cancel</button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
