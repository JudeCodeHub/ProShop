import { formatMoney } from "@/lib/money";

function Message({ children, tone = "muted" }) {
  const toneClass = tone === "error" ? "text-red-700" : "text-slate-500";
  return <p className={`py-10 text-center text-sm ${toneClass}`}>{children}</p>;
}

export default function ProductResults({ term, searching, error, items, cart, currency, onAdd }) {
  if (!term) {
    return <Message>Start typing to search, or scan a barcode.</Message>;
  }
  if (searching) {
    return <Message>Searching…</Message>;
  }
  if (error) {
    return <Message tone="error">Search failed: {error}</Message>;
  }
  if (!items.length) {
    return <Message>No products match &ldquo;{term}&rdquo;.</Message>;
  }

  return (
    <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3 overflow-y-auto pb-2">
      {items.map((item) => {
        const inCart = cart.find((line) => line.id === item.id)?.qty ?? 0;
        const left = item.stockQty - inCart;
        const stockClass = left <= 0 ? "text-red-600" : left <= 5 ? "text-amber-600" : "text-slate-500";

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onAdd(item)}
              disabled={left <= 0}
              className="flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="font-medium text-slate-900">{item.name}</span>
              <span className="text-sm text-slate-600">
                {item.size} / {item.color}
              </span>
              <span className="truncate text-xs text-slate-500">
                {item.brand} · {item.sku}
              </span>
              <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                <span className="font-semibold text-slate-900">
                  {formatMoney(item.unitPriceCents, currency)}
                </span>
                <span className={`text-xs ${stockClass}`}>
                  {item.stockQty <= 0 ? "Out of stock" : left <= 0 ? "All in cart" : `${left} left`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
