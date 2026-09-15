import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="Today's sales, low-stock warnings, recent transactions and the sales trend."
    />
  );
}
