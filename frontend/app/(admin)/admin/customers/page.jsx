import CustomersTable from "@/components/admin/customers/customers-table";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }) {
  const { search, page } = await searchParams;
  const pageNumber = Number.parseInt(typeof page === "string" ? page : "", 10);

  return (
    <CustomersTable
      initialSearch={typeof search === "string" ? search : ""}
      initialPage={Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1}
    />
  );
}
