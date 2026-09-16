"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toCents } from "@/lib/money";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default function RevenueBarChart({ rows, currency, height = 280 }) {
  const data = rows.slice(0, 10).map((row) => ({ name: row.name, revenue: Number(row.revenue) }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value) => compact.format(value)}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 12, fill: "#334155" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => [formatMoney(toCents(value), currency), "Revenue"]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            cursor={{ fill: "#f1f5f9" }}
          />
          <Bar dataKey="revenue" fill="#0f172a" radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
