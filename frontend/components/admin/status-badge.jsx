const STYLES = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  held: "bg-amber-50 text-amber-800 ring-amber-200",
  voided: "bg-slate-100 text-slate-600 ring-slate-300",
  return: "bg-sky-50 text-sky-700 ring-sky-200",
  exchange: "bg-violet-50 text-violet-700 ring-violet-200",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${STYLES[status] ?? STYLES.voided}`}
    >
      {status}
    </span>
  );
}
