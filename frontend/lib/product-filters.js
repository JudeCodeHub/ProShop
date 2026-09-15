import { toCents } from "./money.js";

export function summarizeProduct(product) {
  const prices = product.variants.map((variant) => toCents(variant.sellPrice));
  return {
    ...product,
    variantCount: product.variants.length,
    totalStock: product.variants.reduce((sum, variant) => sum + variant.stockQty, 0),
    soldOutVariants: product.variants.filter((variant) => variant.stockQty === 0).length,
    minPriceCents: prices.length ? Math.min(...prices) : null,
    maxPriceCents: prices.length ? Math.max(...prices) : null,
  };
}

export function filterProducts(products, { search = "", categoryId = "", brand = "" } = {}) {
  const text = search.trim();
  const term = text.toLowerCase();

  return products.filter(
    (product) =>
      (!categoryId || product.categoryId === Number(categoryId)) &&
      (!brand || product.brand.toLowerCase() === brand.toLowerCase()) &&
      (!term ||
        product.name.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term) ||
        product.variants.some(
          (variant) => variant.sku.toLowerCase().includes(term) || variant.barcode === text,
        )),
  );
}

export function brandOptions(products) {
  const byKey = new Map();
  for (const product of products) {
    const key = product.brand.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, product.brand);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
