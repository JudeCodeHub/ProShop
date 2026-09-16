"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default function SalesTrendChart({ buckets, currency, height = 256 }) {
  const data = buckets.map((bucket) => ({
    day: bucket.periodStart,
    total: Number(bucket.total),
    orders: bucket.orders,
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(value) => compact.format(value)}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value, _name, item) => [
              `${formatMoney(toCents(value), currency)} · ${item?.payload?.orders ?? 0} orders`,
              "Sales",
            ]}
            labelFormatter={(value) => formatDay(value)}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Area type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} fill="url(#salesFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
