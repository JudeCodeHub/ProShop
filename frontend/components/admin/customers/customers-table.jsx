"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { buttonClass, cardClass, inputClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 250;

export default function CustomersTable({ initialSearch, initialPage }) {
  const [input, setInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch.trim());
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();

  const customers = useApi(`/customers?${query ? `${query}&` : ""}pageSize=${PAGE_SIZE}`);
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";

  useEffect(() => {
    window.history.replaceState(null, "", query ? `/admin/customers?${query}` : "/admin/customers");
  }, [query]);

  const data = customers.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Find customers by name, phone or email and see their loyalty points and purchases."
        actions={
          <Link href="/admin/customers/new" className={buttonClass.primary}>
            Add customer
          </Link>
        }
      />

      <div className="mb-4 max-w-md">
        <label htmlFor="customer-search" className="sr-only">Search customers</label>
        <input
          id="customer-search"
          type="search"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, phone or email"
          className={inputClass}
        />
      </div>

      {customers.error && <Alert className="mb-4">Could not load customers: {customers.error.message}</Alert>}

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Phone</th>
              <th scope="col" className="px-4 py-3">Email</th>
              <th scope="col" className="px-4 py-3 text-right">Points</th>
              <th scope="col" className="px-4 py-3 text-right">Orders</th>
              <th scope="col" className="px-4 py-3 text-right">Total spent</th>
              <th scope="col" className="px-4 py-3">Last purchase</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${customers.loading && data ? "opacity-60" : ""}`}>
            {!data && !customers.error ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading customers…</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {search ? `No customers match "${search}".` : "No customers yet."}
                </td>
              </tr>
            ) : (
              data.items.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${customer.id}`} className="font-medium text-slate-900 hover:underline">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{customer.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{customer.loyaltyPoints}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{customer.orderCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(toCents(customer.totalSpent), currency)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {customer.lastPurchaseAt ? formatDateTime(customer.lastPurchaseAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} customer{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={buttonClass.secondary}>
              Previous
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={buttonClass.secondary}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
