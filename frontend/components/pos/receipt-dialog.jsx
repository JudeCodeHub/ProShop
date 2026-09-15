"use client";

import { useEffect, useRef } from "react";
import { API_BASE_PATH } from "@/lib/api";
import { formatMoney, toCents } from "@/lib/money";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  dateStyle: "medium",
  timeStyle: "short",
});

const PAYMENT_LABELS = { cash: "Cash", card: "Card", split: "Split" };

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold text-slate-900" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ReceiptDialog({ receipt, onClose }) {
  const newSaleRef = useRef(null);
  const money = (value) => formatMoney(toCents(value), receipt.currency);

  useEffect(() => {
    newSaleRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const printReceipt = () =>
    window.open(`${API_BASE_PATH}/orders/${receipt.orderId}/receipt/pdf`, "_blank", "noopener");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="text-center">
          <p className="text-sm font-medium text-emerald-700">Sale completed</p>
          <h2 id="receipt-title" className="mt-1 text-lg font-semibold text-slate-900">
            {receipt.store.name}
          </h2>
          {receipt.store.address && <p className="text-xs text-slate-500">{receipt.store.address}</p>}
        </div>

        <dl className="mt-4 space-y-0.5 text-sm text-slate-600">
          <Row label="Receipt" value={receipt.receiptNumber} />
          <Row label="Date" value={dateFormat.format(new Date(receipt.issuedAt))} />
          <Row label="Cashier" value={receipt.cashier} />
          {receipt.customer && <Row label="Customer" value={receipt.customer.name} />}
        </dl>

        <ul className="my-4 divide-y divide-slate-100 border-y border-slate-200 text-sm">
          {receipt.items.map((item) => (
            <li key={item.sku} className="py-2">
              <p className="font-medium text-slate-900">
                {item.name} <span className="font-normal text-slate-500">({item.variant})</span>
              </p>
              <div className="flex justify-between text-slate-600">
                <span>
                  {item.qty} × {money(item.unitPrice)}
                </span>
                <span>{money(item.lineTotal)}</span>
              </div>
            </li>
          ))}
        </ul>

        <dl className="space-y-0.5 text-sm text-slate-600">
          <Row label="Subtotal" value={money(receipt.subtotal)} />
          {Number(receipt.discount) > 0 && <Row label="Discount" value={`−${money(receipt.discount)}`} />}
          <Row label={`Tax (${Number(receipt.taxRate)}%)`} value={money(receipt.tax)} />
          <Row label="Total" value={money(receipt.total)} strong />
          <Row label="Paid by" value={PAYMENT_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod} />
        </dl>

        {receipt.store.footer && (
          <p className="mt-4 text-center text-xs text-slate-500">{receipt.store.footer}</p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={printReceipt}
            className="rounded-md px-3 py-2 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100"
          >
            Print receipt
          </button>
          <button
            ref={newSaleRef}
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-800"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
}
