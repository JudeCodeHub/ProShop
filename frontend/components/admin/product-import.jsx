"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { api } from "@/lib/api";
import { buttonClass, cardClass, tableHeadClass } from "@/lib/ui";

const MAX_BYTES = 2 * 1024 * 1024;
const COLUMNS = ["name", "category", "brand", "costPrice", "size", "color", "sellPrice", "stockQty"];
const TEMPLATE = [
  COLUMNS.join(","),
  "Air Zoom Pegasus,Footwear,Nike,12000.00,42,Black,18500.00,10",
  "Air Zoom Pegasus,Footwear,Nike,12000.00,43,Black,18500.00,8",
  "Club Tee,Apparel,Adidas,1500.00,M,White,2990.00,",
].join("\n");

function Stat({ label, value, tone = "text-slate-900" }) {
  return (
    <div className={`p-4 ${cardClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export default function ProductImport() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  function chooseFile(event) {
    const chosen = event.target.files?.[0] ?? null;
    setSummary(null);
    setError("");
    setFile(null);
    if (!chosen) {
      return;
    }
    if (!chosen.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("The file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setFile(chosen);
  }

  async function upload(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setUploading(true);
    setError("");
    setSummary(null);

    const form = new FormData();
    form.append("file", file);
    try {
      setSummary(await api.post("/products/bulk-import", form));
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (err) {
      setError(err.status === 413 ? "The file is larger than 2 MB. Split it into smaller files." : err.message);
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`${TEMPLATE}\n`], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "products-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Bulk import"
        description="Add many products at once from a spreadsheet saved as CSV."
        actions={
          <button type="button" onClick={downloadTemplate} className={buttonClass.secondary}>
            Download template
          </button>
        }
      />

      <section className={`space-y-4 p-5 ${cardClass}`}>
        <div className="text-sm text-slate-600">
          <p>
            One row per size and color. Columns:{" "}
            {COLUMNS.map((column, index) => (
              <span key={column}>
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-800">{column}</code>
                {index < COLUMNS.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </p>
          <p className="mt-1">
            Missing categories and products are created. A blank stockQty means 0. Files can be up to 2 MB and 5,000 rows.
          </p>
        </div>

        <form onSubmit={upload} className="flex flex-wrap items-center gap-3" noValidate>
          <label htmlFor="import-file" className="sr-only">CSV file</label>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={chooseFile}
            disabled={uploading}
            className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
          <button type="submit" disabled={!file || uploading} className={buttonClass.primary}>
            {uploading ? "Importing…" : "Import"}
          </button>
        </form>

        {error && <Alert>{error}</Alert>}
      </section>

      {summary && (
        <section className="space-y-4" aria-labelledby="import-results">
          <h2 id="import-results" className="text-lg font-semibold text-slate-900">Results</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Rows processed" value={summary.processed} />
            <Stat label="Variants created" value={summary.created} tone="text-emerald-700" />
            <Stat label="Rows skipped" value={summary.skipped} tone={summary.skipped ? "text-red-600" : "text-slate-900"} />
            <Stat label="New products" value={summary.productsCreated} />
            <Stat label="New categories" value={summary.categoriesCreated} />
          </div>

          {summary.created > 0 && (
            <Alert tone="success">
              Imported {summary.created} variant{summary.created === 1 ? "" : "s"}.{" "}
              <Link href="/admin/products" className="font-medium underline">View products</Link>
            </Alert>
          )}

          {summary.errors.length > 0 && (
            <div className={`overflow-x-auto ${cardClass}`}>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <caption className="px-4 pt-3 text-left text-sm font-medium text-slate-700">
                  Skipped rows (row numbers match the lines in your file)
                </caption>
                <thead className={tableHeadClass}>
                  <tr>
                    <th scope="col" className="w-20 px-4 py-3">Row</th>
                    <th scope="col" className="px-4 py-3">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.errors.map((rowError) => (
                    <tr key={rowError.row}>
                      <td className="px-4 py-2 align-top tabular-nums">{rowError.row}</td>
                      <td className="px-4 py-2">
                        <ul className="list-inside list-disc text-red-700">
                          {rowError.messages.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
