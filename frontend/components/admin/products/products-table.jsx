"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { formatMoney } from "@/lib/money";
import { brandOptions, filterProducts, summarizeProduct } from "@/lib/product-filters";
import { buttonClass, cardClass, inputClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const NO_FILTERS = { search: "", categoryId: "", brand: "" };

export default function ProductsTable() {
  const products = useApi("/products");
  const categories = useApi("/categories");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const [filters, setFilters] = useState(NO_FILTERS);

  const brands = useMemo(() => brandOptions(products.data ?? []), [products.data]);
  const rows = useMemo(
    () => filterProducts(products.data ?? [], filters).map(summarizeProduct),
    [products.data, filters],
  );

  const setFilter = (key) => (event) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  const hasFilters = Boolean(filters.search || filters.categoryId || filters.brand);
  const total = products.data?.length ?? 0;

  const price = (row) => {
    if (row.minPriceCents === null) {
      return "—";
    }
    return row.minPriceCents === row.maxPriceCents
      ? formatMoney(row.minPriceCents, currency)
      : `${formatMoney(row.minPriceCents, currency)} – ${formatMoney(row.maxPriceCents, currency)}`;
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Everything the shop sells, with variant counts and stock across all sizes and colors."
        actions={
          <Link href="/admin/products/new" className={buttonClass.primary}>
            Add product
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          type="search"
          aria-label="Search products"
          placeholder="Search name, brand, SKU or barcode"
          value={filters.search}
          onChange={setFilter("search")}
          className={inputClass}
        />
        <select aria-label="Filter by category" value={filters.categoryId} onChange={setFilter("categoryId")} className={inputClass}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by brand" value={filters.brand} onChange={setFilter("brand")} className={inputClass}>
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className={buttonClass.secondary}>
            Clear
          </button>
        )}
      </div>

      {products.error && <Alert className="mb-4">Could not load products: {products.error.message}</Alert>}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Product</th>
              <th scope="col" className="px-4 py-3">Category</th>
              <th scope="col" className="px-4 py-3">Brand</th>
              <th scope="col" className="px-4 py-3 text-right">Variants</th>
              <th scope="col" className="px-4 py-3 text-right">Total stock</th>
              <th scope="col" className="px-4 py-3 text-right">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.loading && !products.data ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading products…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {total === 0 ? (
                    <>
                      No products yet.{" "}
                      <Link href="/admin/products/new" className="font-medium text-slate-900 underline">Add one</Link> or{" "}
                      <Link href="/admin/import" className="font-medium text-slate-900 underline">import a CSV</Link>.
                    </>
                  ) : (
                    "No products match these filters."
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/products/${row.id}`} className="font-medium text-slate-900 hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.category?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.brand}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.variantCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={row.totalStock === 0 ? "font-medium text-red-600" : ""}>{row.totalStock}</span>
                    {row.soldOutVariants > 0 && row.totalStock > 0 && (
                      <span className="ml-2 text-xs text-amber-600">{row.soldOutVariants} sold out</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{price(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Showing {rows.length} of {total} products
        </p>
      )}
    </div>
  );
}
