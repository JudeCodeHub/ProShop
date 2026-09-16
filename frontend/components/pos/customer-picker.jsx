"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney, toCents } from "@/lib/money";

const SEARCH_DELAY_MS = 250;
const smallInput =
  "block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";
const smallButton =
  "rounded-md px-2 py-1 text-xs font-medium ring-1 ring-slate-300 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

export const toCustomer = ({ id, name, phone, email, loyaltyPoints }) => ({ id, name, phone, email, loyaltyPoints });

export default function CustomerPicker({ customer, redemption, currency, disabled, onSelect, onClear, onRedemptionChange }) {
  const [mode, setMode] = useState("idle");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ term: "", items: [], error: "" });
  const [draft, setDraft] = useState({ name: "", phone: "" });
  const [pointsInput, setPointsInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const term = query.trim();
  const searchIsCurrent = term !== "" && search.term === term;

  useEffect(() => {
    if (mode !== "search" || !term) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(`/customers?search=${encodeURIComponent(term)}&pageSize=6`, { signal: controller.signal });
        setSearch({ term, items: result.items, error: "" });
      } catch (err) {
        if (!controller.signal.aborted) {
          setSearch({ term, items: [], error: err.message });
        }
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, term]);

  function pick(item) {
    onSelect(toCustomer(item));
    setMode("idle");
    setQuery("");
    setPointsInput("");
    setError("");
  }

  async function createCustomer(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.post("/customers", {
        name: draft.name,
        ...(draft.phone.trim() && { phone: draft.phone }),
      });
      setDraft({ name: "", phone: "" });
      pick(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyPoints(event) {
    event.preventDefault();
    const points = Number(pointsInput);
    if (!Number.isInteger(points) || points < 1) {
      setError("Enter a whole number of points.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const quote = await api.post(`/customers/${customer.id}/redeem-points`, { points });
      onRedemptionChange({ points, discountCents: toCents(quote.discountValue) });
      setPointsInput("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Customer</span>
        {!customer && mode === "idle" && (
          <button type="button" onClick={() => setMode("search")} disabled={locked} className={smallButton}>
            Add customer
          </button>
        )}
      </div>

      {customer ? (
        <div className="space-y-2 rounded-md bg-slate-50 p-2 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{customer.name}</p>
              <p className="text-xs text-slate-500">
                {customer.phone ?? "No phone"} · {customer.loyaltyPoints} point{customer.loyaltyPoints === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClear();
                setError("");
              }}
              disabled={locked}
              className={smallButton}
            >
              Remove
            </button>
          </div>

          {redemption ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-emerald-700">
                Using {redemption.points} points (−{formatMoney(redemption.discountCents, currency)})
              </span>
              <button type="button" onClick={() => onRedemptionChange(null)} disabled={locked} className={smallButton}>
                Stop using
              </button>
            </div>
          ) : customer.loyaltyPoints > 0 ? (
            <form onSubmit={applyPoints} className="flex gap-2" noValidate>
              <label htmlFor="pos-points" className="sr-only">Points to use</label>
              <input
                id="pos-points"
                inputMode="numeric"
                value={pointsInput}
                onChange={(event) => setPointsInput(event.target.value)}
                placeholder={`Points (max ${customer.loyaltyPoints})`}
                disabled={locked}
                className={smallInput}
              />
              <button type="submit" disabled={locked} className={`${smallButton} shrink-0`}>
                {busy ? "Checking…" : "Use points"}
              </button>
            </form>
          ) : null}
        </div>
      ) : mode === "search" ? (
        <div className="space-y-2">
          <label htmlFor="pos-customer-search" className="sr-only">Search customers</label>
          <input
            id="pos-customer-search"
            type="search"
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or phone"
            className={smallInput}
          />
          {term && (
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-md ring-1 ring-slate-200">
              {!searchIsCurrent ? (
                <li className="px-2 py-2 text-xs text-slate-500">Searching…</li>
              ) : search.error ? (
                <li className="px-2 py-2 text-xs text-red-700">{search.error}</li>
              ) : search.items.length === 0 ? (
                <li className="px-2 py-2 text-xs text-slate-500">No customers found.</li>
              ) : (
                search.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => pick(item)} className="flex w-full justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50">
                      <span>
                        <span className="font-medium text-slate-900">{item.name}</span>{" "}
                        <span className="text-slate-500">{item.phone ?? ""}</span>
                      </span>
                      <span className="text-slate-500">{item.loyaltyPoints} pts</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("create")} className={smallButton}>New customer</button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setQuery("");
                setError("");
              }}
              className={smallButton}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === "create" ? (
        <form onSubmit={createCustomer} className="space-y-2" noValidate>
          <label htmlFor="pos-new-name" className="sr-only">Customer name</label>
          <input id="pos-new-name" autoFocus value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} placeholder="Name" className={smallInput} />
          <label htmlFor="pos-new-phone" className="sr-only">Phone</label>
          <input id="pos-new-phone" type="tel" value={draft.phone} onChange={(event) => setDraft((d) => ({ ...d, phone: event.target.value }))} placeholder="Phone (optional)" className={smallInput} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={smallButton}>{busy ? "Saving…" : "Save customer"}</button>
            <button type="button" onClick={() => setMode("search")} disabled={busy} className={smallButton}>Back</button>
          </div>
        </form>
      ) : null}

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
