"use client";

import Link from "next/link";
import Alert from "@/components/admin/alert";
import PageHeader from "@/components/admin/page-header";
import { useApi } from "@/lib/use-api";
import ProductForm from "./product-form";
import VariantManager from "./variant-manager";

const BACK = { href: "/admin/products", label: "Products" };

export default function ProductEditor({ id }) {
  const isNew = id === "new";
  const product = useApi(isNew ? null : `/products/${encodeURIComponent(id)}`);
  const categories = useApi("/categories");
  const settings = useApi("/settings");
  const currency = settings.data?.currency ?? "LKR";

  if (!isNew && product.error) {
    const missing = product.error.status === 404 || product.error.status === 400;
    return (
      <div>
        <PageHeader title="Product not found" back={BACK} />
        <Alert>{missing ? `There is no product with id "${id}".` : product.error.message}</Alert>
      </div>
    );
  }

  if (categories.error) {
    return (
      <div>
        <PageHeader title={isNew ? "Add product" : "Product"} back={BACK} />
        <Alert>Could not load categories: {categories.error.message}</Alert>
      </div>
    );
  }

  if ((!isNew && !product.data) || !categories.data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        back={BACK}
        title={isNew ? "Add product" : product.data.name}
        description={
          isNew
            ? "Create the product first, then add its sizes and colors."
            : `${product.data.brand} · ${product.data.category?.name ?? ""}`
        }
      />

      {categories.data.length === 0 ? (
        <Alert tone="warning">
          You need at least one category before adding products.{" "}
          <Link href="/admin/categories" className="font-medium underline">
            Create a category
          </Link>
          .
        </Alert>
      ) : (
        <ProductForm
          key={isNew ? "new" : product.data.id}
          product={isNew ? null : product.data}
          categories={categories.data}
          onSaved={product.reload}
        />
      )}

      {!isNew && (
        <VariantManager
          productId={product.data.id}
          variants={product.data.variants}
          currency={currency}
          onChanged={product.reload}
        />
      )}
    </div>
  );
}
