export default function PagePlaceholder({ title, description }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {description && <p className="max-w-2xl text-slate-600">{description}</p>}
      <p className="inline-block rounded-md bg-amber-50 px-3 py-1 text-sm text-amber-800 ring-1 ring-amber-200">
        Placeholder page
      </p>
    </section>
  );
}
