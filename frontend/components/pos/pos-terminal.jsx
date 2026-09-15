"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cartTotals, toCents } from "@/lib/money";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import CartPanel from "./cart-panel";
import ProductResults from "./product-results";
import ReceiptDialog from "./receipt-dialog";

const SEARCH_DELAY_MS = 250;

function toItem(product, variant) {
  return {
    id: variant.id,
    name: product.name,
    brand: product.brand,
    size: variant.size,
    color: variant.color,
    sku: variant.sku,
    stockQty: variant.stockQty,
    unitPriceCents: toCents(variant.sellPrice),
  };
}

const describe = (item) => `${item.name} (${item.size} / ${item.color})`;

export default function PosTerminal() {
  const searchRef = useRef(null);
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ term: "", items: [], error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [cart, setCart] = useState([]);
  const [discountMode, setDiscountMode] = useState("amount");
  const [discountInput, setDiscountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(null);
  const [notice, setNotice] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const term = query.trim();
  const searchIsCurrent = term !== "" && search.term === term;
  const results = searchIsCurrent ? search.items : [];
  const currency = settings?.currency ?? "LKR";
  const taxRate = settings?.taxRate ?? "0";
  const totals = cartTotals(cart, { discountMode, discountInput, taxRate });

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/settings")
      .then((data) => !cancelled && setSettings(data))
      .catch((error) => !cancelled && setSettingsError(error.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!term) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const products = await api.get(`/products?search=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        setSearch({
          term,
          items: products.flatMap((product) => product.variants.map((v) => toItem(product, v))),
          error: "",
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearch({ term, items: [], error: error.message });
        }
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, refreshKey]);

  const addToCart = useCallback(
    (item) => {
      const inCart = cart.find((line) => line.id === item.id)?.qty ?? 0;
      if (item.stockQty <= inCart) {
        setNotice({
          type: "error",
          text:
            item.stockQty === 0
              ? `${describe(item)} is out of stock.`
              : `Only ${item.stockQty} of ${describe(item)} in stock.`,
        });
        return;
      }
      setCart((current) =>
        inCart
          ? current.map((line) =>
              line.id === item.id ? { ...line, qty: line.qty + 1, stockQty: item.stockQty } : line,
            )
          : [...current, { ...item, qty: 1 }],
      );
      setNotice({ type: "success", text: `Added ${describe(item)}.` });
    },
    [cart],
  );

  const scan = useCallback(
    async (raw) => {
      const code = raw.trim();
      if (!code) {
        return;
      }
      setReceipt(null);
      try {
        const variant = await api.get(`/variants/barcode/${encodeURIComponent(code)}`);
        addToCart(toItem(variant.product, variant));
        setQuery("");
      } catch (error) {
        const visible = search.term === code ? search.items : [];
        if (error.status === 404 && visible.length === 1) {
          addToCart(visible[0]);
          setQuery("");
        } else {
          setNotice({
            type: "error",
            text: error.status === 404 ? `No product found for "${code}".` : error.message,
          });
        }
      }
      focusSearch();
    },
    [addToCart, search, focusSearch],
  );

  useBarcodeScanner(scan);

  const changeQty = (id, qty) =>
    setCart((current) =>
      current.map((line) =>
        line.id === id ? { ...line, qty: Math.min(Math.max(1, qty), line.stockQty) } : line,
      ),
    );

  const removeLine = (id) => setCart((current) => current.filter((line) => line.id !== id));

  const resetSale = () => {
    setCart([]);
    setDiscountInput("");
    setDiscountMode("amount");
    setPaymentMethod("cash");
  };

  async function submit(kind) {
    if (!cart.length || totals.discountError || submitting) {
      return;
    }
    setSubmitting(kind);
    setNotice(null);

    const body = {
      items: cart.map((line) => ({ variantId: line.id, qty: line.qty })),
      paymentMethod,
      ...(totals.discount > 0 && { discount: totals.discount / 100 }),
    };

    try {
      const order = await api.post(kind === "hold" ? "/orders/hold" : "/orders", body);
      resetSale();
      setRefreshKey((key) => key + 1);

      if (kind === "hold") {
        setNotice({ type: "success", text: `Sale held as order #${order.id}. Resume it from Held sales.` });
      } else {
        setNotice({ type: "success", text: `Sale #${order.id} completed.` });
        try {
          setReceipt(await api.get(`/orders/${order.id}/receipt`));
        } catch (error) {
          setNotice({
            type: "error",
            text: `Sale #${order.id} completed, but the receipt could not be loaded: ${error.message}`,
          });
        }
      }
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSubmitting(null);
      focusSearch();
    }
  }

  const closeReceipt = useCallback(() => {
    setReceipt(null);
    focusSearch();
  }, [focusSearch]);

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex min-h-0 flex-col gap-3" aria-label="Products">
        <label htmlFor="pos-search" className="sr-only">
          Search products or scan a barcode
        </label>
        <input
          ref={searchRef}
          id="pos-search"
          type="search"
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              scan(query);
            }
          }}
          placeholder="Search by name, brand or SKU, or scan a barcode"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />

        {settingsError && (
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            Could not load store settings ({settingsError}). The tax shown may be wrong; the server
            still calculates the real total.
          </p>
        )}
        {notice && (
          <p
            role={notice.type === "error" ? "alert" : "status"}
            className={`rounded-md px-3 py-2 text-sm ring-1 ${
              notice.type === "error"
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-emerald-50 text-emerald-800 ring-emerald-200"
            }`}
          >
            {notice.text}
          </p>
        )}

        <ProductResults
          term={term}
          searching={term !== "" && !searchIsCurrent}
          error={searchIsCurrent ? search.error : ""}
          items={results}
          cart={cart}
          currency={currency}
          onAdd={(item) => {
            addToCart(item);
            focusSearch();
          }}
        />
      </section>

      <CartPanel
        cart={cart}
        currency={currency}
        taxRate={taxRate}
        totals={totals}
        discountMode={discountMode}
        discountInput={discountInput}
        paymentMethod={paymentMethod}
        submitting={submitting}
        onDiscountModeChange={setDiscountMode}
        onDiscountInputChange={setDiscountInput}
        onPaymentMethodChange={setPaymentMethod}
        onQtyChange={changeQty}
        onRemove={removeLine}
        onClear={resetSale}
        onHold={() => submit("hold")}
        onComplete={() => submit("complete")}
      />

      {receipt && <ReceiptDialog receipt={receipt} onClose={closeReceipt} />}
    </div>
  );
}
