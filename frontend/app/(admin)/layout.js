import AdminSidebar from "@/components/admin-sidebar";

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
