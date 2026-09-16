"use client";

import Link from "next/link";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import { api } from "@/lib/api";
import { formatMoney, toCents } from "@/lib/money";
import { buttonClass, cardClass, inputClass, labelClass } from "@/lib/ui";

export default function RedeemPointsPanel({ customer, currency }) {
  const [points, setPoints] = useState("");
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function checkValue(event) {
    event.preventDefault();
    const value = Number(points);
    if (!Number.isInteger(value) || value < 1) {
      setError("Enter a whole number of points.");
      setQuote(null);
      return;
    }
    setChecking(true);
    setError("");
    try {
      setQuote(await api.post(`/customers/${customer.id}/redeem-points`, { points: value }));
    } catch (err) {
      setQuote(null);
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className={`space-y-4 p-5 ${cardClass}`} aria-labelledby="redeem-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="redeem-title" className="text-lg font-semibold text-slate-900">Redeem points</h2>
          <p className="text-sm text-slate-600">
            Check what points are worth. They are taken when a sale using them is completed at the POS.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Balance</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{customer.loyaltyPoints}</p>
        </div>
      </div>

      <form onSubmit={checkValue} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="space-y-1">
          <label htmlFor="redeem-points" className={labelClass}>Points to use</label>
          <input
            id="redeem-points"
            inputMode="numeric"
            value={points}
            onChange={(event) => {
              setPoints(event.target.value);
              setQuote(null);
            }}
            placeholder={customer.loyaltyPoints > 0 ? String(customer.loyaltyPoints) : "0"}
            disabled={customer.loyaltyPoints === 0}
            className={`${inputClass} w-40`}
          />
        </div>
        <button type="submit" disabled={checking || customer.loyaltyPoints === 0} className={buttonClass.secondary}>
          {checking ? "Checking…" : "Check value"}
        </button>
        <Link href={`/pos?customerId=${customer.id}`} className={buttonClass.primary}>
          Start a sale
        </Link>
      </form>

      {customer.loyaltyPoints === 0 && (
        <p className="text-sm text-slate-500">This customer has no points yet. They earn points on every completed sale.</p>
      )}
      {error && <Alert>{error}</Alert>}
      {quote && (
        <Alert tone="success">
          {quote.points} points = <strong>{formatMoney(toCents(quote.discountValue), currency)}</strong> off. Balance after the sale: {quote.balanceAfter} points.
        </Alert>
      )}
    </section>
  );
}
