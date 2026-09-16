import Alert from "@/components/admin/alert";
import { cardClass, tableHeadClass } from "@/lib/ui";

export function ReportState({ query, children, empty = "No data for this period." }) {
  if (query.error) {
    return <Alert>Could not load this report: {query.error.message}</Alert>;
  }
  if (!query.data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  return children(query.data, empty);
}

export function ReportTable({ head, children, caption }) {
  return (
    <div className={`overflow-x-auto ${cardClass}`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="px-4 pt-3 text-left text-sm text-slate-600">{caption}</caption>}
        <thead className={tableHeadClass}>{head}</thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
        {text}
      </td>
    </tr>
  );
}
