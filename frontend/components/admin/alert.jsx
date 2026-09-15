const TONES = {
  error: "bg-red-50 text-red-700 ring-red-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  info: "bg-slate-50 text-slate-700 ring-slate-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
};

export default function Alert({ tone = "error", children, className = "" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md px-3 py-2 text-sm ring-1 ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
