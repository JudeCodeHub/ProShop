import PagePlaceholder from "@/components/page-placeholder";

export const metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <PagePlaceholder
      title="Products"
      description="All products with search and category and brand filters, showing variant count and total stock."
    />
  );
}
