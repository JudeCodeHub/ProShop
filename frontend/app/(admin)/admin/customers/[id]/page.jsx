import CustomerEditor from "@/components/admin/customers/customer-editor";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }) {
  const { id } = await params;
  return <CustomerEditor id={id} />;
}
