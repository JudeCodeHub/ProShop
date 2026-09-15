import LogoutButton from "@/components/logout-button";
import NavLink from "@/components/nav-link";

const linkClasses = {
  className: "rounded-md px-3 py-1.5 text-sm transition-colors",
  activeClassName: "bg-slate-700 font-medium text-white",
  inactiveClassName: "text-slate-300 hover:bg-slate-800 hover:text-white",
};

export default function PosLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 bg-slate-900 px-4 py-2">
        <span className="font-semibold text-white">ProShop POS</span>
        <nav className="flex gap-1" aria-label="POS">
          <NavLink href="/pos" exact {...linkClasses}>
            Checkout
          </NavLink>
          <NavLink href="/pos/held" {...linkClasses}>
            Held sales
          </NavLink>
        </nav>
        <LogoutButton className="text-slate-300" />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
