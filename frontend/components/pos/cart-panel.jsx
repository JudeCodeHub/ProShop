import { formatMoney } from "@/lib/money";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "split", label: "Split" },
];

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between ${strong ? "text-lg font-semibold text-slate-900" : "text-sm text-slate-600"}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function CartPanel({
  cart,
  currency,
  taxRate,
  totals,
  discountMode,
  discountInput,
  paymentMethod,
  submitting,
  onDiscountModeChange,
  onDiscountInputChange,
  onPaymentMethodChange,
  onQtyChange,
  onRemove,
  onClear,
  onHold,
  onComplete,
}) {
  const money = (cents) => formatMoney(cents, currency);
  const itemCount = cart.reduce((count, line) => count + line.qty, 0);
  const busy = Boolean(submitting);
  const canSubmit = cart.length > 0 && !totals.discountError && !busy;

  return (
    <aside className="flex min-h-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200" aria-label="Cart">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-900">
          Cart{" "}
          {itemCount > 0 && (
            <span className="font-normal text-slate-500">
              ({itemCount} {itemCount === 1 ? "item" : "items"})
            </span>
          )}
        </h2>
        {cart.length > 0 && (
          <button type="button" onClick={onClear} disabled={busy} className="text-sm text-slate-500 hover:text-red-600 disabled:opacity-50">
            Clear
          </button>
        )}
      </header>

      {cart.length === 0 ? (
        <p className="flex-1 px-4 py-10 text-center text-sm text-slate-500">The cart is empty.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {cart.map((line) => {
            const label = `${line.name} (${line.size} / ${line.color})`;
            return (
              <li key={line.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{line.name}</p>
                    <p className="text-xs text-slate-500">
                      {line.size} / {line.color} · {money(line.unitPriceCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line.id)}
                    disabled={busy}
                    aria-label={`Remove ${label}`}
                    className="h-7 w-7 shrink-0 rounded text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center overflow-hidden rounded-md ring-1 ring-slate-300">
                    <button
                      type="button"
                      onClick={() => onQtyChange(line.id, line.qty - 1)}
                      disabled={busy || line.qty <= 1}
                      aria-label={`Decrease quantity of ${label}`}
                      className="h-8 w-8 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={line.stockQty}
                      value={line.qty}
                      disabled={busy}
                      onChange={(event) => {
                        const qty = Number.parseInt(event.target.value, 10);
                        if (!Number.isNaN(qty)) {
                          onQtyChange(line.id, qty);
                        }
                      }}
                      aria-label={`Quantity of ${label}`}
                      className="h-8 w-12 border-x border-slate-300 text-center [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => onQtyChange(line.id, line.qty + 1)}
                      disabled={busy || line.qty >= line.stockQty}
                      aria-label={`Increase quantity of ${label}`}
                      className="h-8 w-8 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-medium text-slate-900">{money(line.unitPriceCents * line.qty)}</span>
                </div>
                {line.qty >= line.stockQty && (
                  <p className="mt-1 text-xs text-amber-600">All {line.stockQty} in stock are in the cart.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-4 border-t border-slate-200 px-4 py-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="pos-discount" className="text-sm font-medium text-slate-700">
              Discount
            </label>
            <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-slate-300" role="group" aria-label="Discount type">
              {[
                { value: "amount", label: currency },
                { value: "percent", label: "%" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onDiscountModeChange(option.value)}
                  aria-pressed={discountMode === option.value}
                  className={`px-2 py-1 ${discountMode === option.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <input
            id="pos-discount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={discountInput}
            disabled={busy}
            onChange={(event) => onDiscountInputChange(event.target.value)}
            aria-invalid={Boolean(totals.discountError)}
            aria-describedby={totals.discountError ? "pos-discount-error" : undefined}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-right focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          {totals.discountError && (
            <p id="pos-discount-error" className="text-xs text-red-600">
              {totals.discountError}
            </p>
          )}
        </div>

        <dl className="space-y-1">
          <Row label="Subtotal" value={money(totals.subtotal)} />
          {totals.discount > 0 && <Row label="Discount" value={`−${money(totals.discount)}`} />}
          <Row label={`Tax (${Number(taxRate)}%)`} value={money(totals.tax)} />
          <Row label="Total" value={money(totals.total)} strong />
        </dl>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Payment method</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.value}
                className={`cursor-pointer rounded-md py-2 text-center text-sm ring-1 ${
                  paymentMethod === method.value
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "text-slate-700 ring-slate-300 hover:bg-slate-100"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method.value}
                  checked={paymentMethod === method.value}
                  onChange={() => onPaymentMethodChange(method.value)}
                  disabled={busy}
                  className="sr-only"
                />
                {method.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onHold}
            disabled={!canSubmit}
            className="rounded-md px-3 py-3 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "hold" ? "Holding…" : "Hold Sale"}
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={!canSubmit}
            className="rounded-md bg-emerald-600 px-3 py-3 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "complete" ? "Completing…" : "Complete Sale"}
          </button>
        </div>
      </div>
    </aside>
  );
}
