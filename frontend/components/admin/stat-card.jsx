import { cardClass } from "@/lib/ui";

export default function StatCard({ label, value, hint, tone = "text-slate-900" }) {
  return (
    <div className={`p-4 ${cardClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
