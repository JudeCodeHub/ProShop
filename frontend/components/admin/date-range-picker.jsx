"use client";

import { rangePresets } from "@/lib/reports";
import { inputClass, labelClass } from "@/lib/ui";

export default function DateRangePicker({ range, onChange, idPrefix = "range" }) {
  const presets = rangePresets();
  const matches = (preset) => preset.from === range.from && preset.to === range.to;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-from`} className={labelClass}>From</label>
        <input
          id={`${idPrefix}-from`}
          type="date"
          value={range.from}
          max={range.to || undefined}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-to`} className={labelClass}>To</label>
        <input
          id={`${idPrefix}-to`}
          type="date"
          value={range.to}
          min={range.from || undefined}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap gap-1 pb-1" role="group" aria-label="Quick date ranges">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange({ from: preset.from, to: preset.to })}
            aria-pressed={matches(preset)}
            className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${
              matches(preset) ? "bg-slate-900 text-white ring-slate-900" : "text-slate-700 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
