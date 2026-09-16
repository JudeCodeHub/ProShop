"use client";

import { formatMoney, toCents } from "@/lib/money";
import { rangeQuery } from "@/lib/reports";
import { useApi } from "@/lib/use-api";
import { EmptyRow, ReportState, ReportTable } from "./report-shell";

export default function StaffReport({ range, currency }) {
  const query = useApi(range ? `/reports/staff-performance${rangeQuery(range)}` : null);
  const money = (value) => formatMoney(toCents(value), currency);

  return (
    <ReportState query={query}>
      {(data) => (
        <ReportTable
          caption={`${data.from} to ${data.to} · completed sales only`}
          head={
            <tr>
              <th scope="col" className="px-4 py-3">Staff member</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3 text-right">Orders</th>
              <th scope="col" className="px-4 py-3 text-right">Items</th>
              <th scope="col" className="px-4 py-3 text-right">Net sales</th>
              <th scope="col" className="px-4 py-3 text-right">Total taken</th>
              <th scope="col" className="px-4 py-3 text-right">Average sale</th>
              <th scope="col" className="px-4 py-3 text-right">Voided</th>
            </tr>
          }
        >
          {data.staff.length === 0 ? (
            <EmptyRow colSpan={8} text="No staff found." />
          ) : (
            data.staff.map((member) => (
              <tr key={member.userId} className={member.orders === 0 ? "text-slate-400" : ""}>
                <td className="px-4 py-2 font-medium text-slate-900">{member.name}</td>
                <td className="px-4 py-2 capitalize text-slate-600">{member.role}</td>
                <td className="px-4 py-2 text-right tabular-nums">{member.orders}</td>
                <td className="px-4 py-2 text-right tabular-nums">{member.itemsSold}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(member.netSales)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(member.total)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{member.averageSale ? money(member.averageSale) : "—"}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${member.voidedOrders > 0 ? "text-amber-600" : ""}`}>
                  {member.voidedOrders}
                </td>
              </tr>
            ))
          )}
        </ReportTable>
      )}
    </ReportState>
  );
}
