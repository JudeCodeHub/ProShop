import Link from "next/link";
import NavLink from "./nav-link";

const NAV_SECTIONS = [
  { heading: null, links: [{ href: "/admin/dashboard", label: "Dashboard" }] },
  {
    heading: "Inventory",
    links: [
      { href: "/admin/products", label: "Products" },
      { href: "/admin/categories", label: "Categories" },
      { href: "/admin/import", label: "Bulk import" },
      { href: "/admin/stock-adjustments", label: "Stock adjustments" },
    ],
  },
  {
    heading: "Sales",
    links: [
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/returns", label: "Returns" },
    ],
  },
  { heading: "Customers", links: [{ href: "/admin/customers", label: "Customers" }] },
  { heading: "Reports", links: [{ href: "/admin/reports", label: "Reports" }] },
  {
    heading: "Purchasing",
    links: [
      { href: "/admin/suppliers", label: "Suppliers" },
      { href: "/admin/purchase-orders", label: "Purchase orders" },
    ],
  },
  {
    heading: "Admin",
    links: [
      { href: "/admin/settings", label: "Store settings" },
      { href: "/admin/users", label: "Users" },
    ],
  },
];

export default function AdminSidebar() {
  return (
    <aside className="flex shrink-0 flex-col bg-slate-900 text-slate-300 md:w-60">
      <Link href="/admin/dashboard" className="px-5 py-5 text-lg font-semibold text-white">
        ProShop Admin
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {NAV_SECTIONS.map((section) => (
          <div key={section.heading ?? "home"}>
            {section.heading && (
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {section.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.links.map((link) => (
                <li key={link.href}>
                  <NavLink
                    href={link.href}
                    className="block rounded-md px-2 py-1.5 text-sm transition-colors"
                    activeClassName="bg-slate-800 font-medium text-white"
                    inactiveClassName="hover:bg-slate-800/60 hover:text-white"
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <Link
        href="/pos"
        className="m-3 rounded-md bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
      >
        Open POS
      </Link>
    </aside>
  );
}
