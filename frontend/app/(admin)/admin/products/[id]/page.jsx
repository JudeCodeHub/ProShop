import ProductEditor from "@/components/admin/products/product-editor";

export const metadata = { title: "Product" };

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  return <ProductEditor id={id} />;
}
