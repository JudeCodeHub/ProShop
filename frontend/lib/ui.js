export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100";

export const labelClass = "block text-sm font-medium text-slate-700";

const buttonBase =
  "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${buttonBase} bg-slate-900 text-white hover:bg-slate-800`,
  secondary: `${buttonBase} bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50`,
  danger: `${buttonBase} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50`,
  small: "rounded px-2 py-1 text-xs font-medium ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  smallDanger:
    "rounded px-2 py-1 text-xs font-medium ring-1 ring-red-200 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50",
};

export const cardClass = "rounded-lg bg-white shadow-sm ring-1 ring-slate-200";

export const tableHeadClass =
  "bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
