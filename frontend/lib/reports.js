import { addDays, todayInStore } from "./dates.js";

export const REPORT_VIEWS = [
  { key: "sales-summary", label: "Sales summary" },
  { key: "best-sellers", label: "Best sellers" },
  { key: "revenue", label: "Revenue by category" },
  { key: "staff", label: "Staff performance" },
  { key: "stock", label: "Stock valuation" },
  { key: "profit", label: "Profit margin" },
];

export const isReportView = (key) => REPORT_VIEWS.some((view) => view.key === key);

export function rangePresets(today = todayInStore()) {
  return [
    { key: "7d", label: "Last 7 days", from: addDays(today, -6), to: today },
    { key: "30d", label: "Last 30 days", from: addDays(today, -29), to: today },
    { key: "90d", label: "Last 90 days", from: addDays(today, -89), to: today },
    { key: "year", label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

export function rangeQuery({ from = "", to = "" } = {}, extra = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const rangeError = ({ from = "", to = "" } = {}) =>
  from && to && from > to ? "The start date must be on or before the end date." : "";

export function percentOf(part, whole) {
  const total = Number(whole);
  return total === 0 ? 0 : (Number(part) / total) * 100;
}
