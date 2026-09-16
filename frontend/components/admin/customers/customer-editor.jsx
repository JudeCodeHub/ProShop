"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/orders";
import { buttonClass, cardClass, tableHeadClass } from "@/lib/ui";
import { useApi } from "@/lib/use-api";
import CustomerForm from "./customer-form";
import RedeemPointsPanel from "./redeem-points-panel";

const BACK = { href: "/admin/customers", label: "Customers" };

function Stat({ label, value }) {
  return (
    <div className={`p-4 ${cardClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function CustomerEditor({ id }) {
  const router = useRouter();
  const isNew = id === "new";
  const customer = useApi(isNew ? null : `/customers/${encodeURIComponent(id)}`);
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  if (isNew) {
    return (
      <div>
        <PageHeader title="Add customer" back={BACK} />
        <CustomerForm onSaved={(created) => router.replace(`/admin/customers/${created.id}`)} />
      </div>
    );
  }

  if (customer.error) {
    const missing = customer.error.status === 404 || customer.error.status === 400;
    return (
      <div>
        <PageHeader title="Customer not found" back={BACK} />
        <Alert>{missing ? `There is no customer with id "${id}".` : customer.error.message}</Alert>
      </div>
    );
  }
  if (!customer.data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const data = customer.data;
  const money = (value) => formatMoney(toCents(value), currency);
  const contact = [data.phone, data.email].filter(Boolean).join(" · ") || "No phone or email";

  return (
    <div className="space-y-6">
      <PageHeader
        back={BACK}
        title={data.name}
        description={contact}
        actions={
          !editing && (
            <button
              type="button"
              onClick={() => {
                setNotice("");
                setEditing(true);
              }}
              className={buttonClass.secondary}
            >
              Edit
            </button>
          )
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}

      {editing && (
        <CustomerForm
          customer={data}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Customer saved.");
            customer.reload();
          }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={data.orderCount} />
        <Stat label="Total spent" value={money(data.totalSpent)} />
        <Stat label="Last purchase" value={data.lastPurchaseAt ? formatDateTime(data.lastPurchaseAt) : "—"} />
        <Stat label="Customer since" value={formatDateTime(data.createdAt)} />
      </div>

      <RedeemPointsPanel customer={data} currency={currency} />

      <section className={`overflow-hidden ${cardClass}`} aria-labelledby="history-title">
        <h2 id="history-title" className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
          Purchase history
        </h2>
        {data.orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No purchases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">Order</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Payment</th>
                  <th scope="col" className="px-4 py-3 text-right">Items</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right">Points earned</th>
                  <th scope="col" className="px-4 py-3 text-right">Points used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                        #{order.id}
                      </Link>
                      {order.returnCount > 0 && (
                        <span className="ml-2 text-xs text-sky-700">
                          {order.returnCount} return{order.returnCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(order.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(order.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{order.pointsEarned ? `+${order.pointsEarned}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{order.pointsRedeemed ? `−${order.pointsRedeemed}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
