import { parseAmount, toCents } from "./money.js";

export const PO_STATUS_LABELS = { pending: "Pending", received: "Received" };

export const MAX_LINE_QTY = 100000;
export const MAX_LINES = 200;

export function variantOptions(products) {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      productName: product.name,
      brand: product.brand,
      sku: variant.sku,
      barcode: variant.barcode,
      size: variant.size,
      color: variant.color,
      stockQty: variant.stockQty,
      costPrice: product.costPrice,
    })),
  );
}

export const variantLabel = (option) =>
  `${option.productName} · ${option.size} · ${option.color}`;

export function searchVariants(options, search, chosenIds = [], limit = 8) {
  const text = search.trim();
  const term = text.toLowerCase();
  if (!term) {
    return [];
  }
  const taken = new Set(chosenIds);
  return options
    .filter(
      (option) =>
        !taken.has(option.variantId) &&
        (option.productName.toLowerCase().includes(term) ||
          option.brand.toLowerCase().includes(term) ||
          option.sku.toLowerCase().includes(term) ||
          option.barcode === text),
    )
    .slice(0, limit);
}

export const lineFrom = (option) => ({
  variantId: option.variantId,
  label: variantLabel(option),
  sku: option.sku,
  qty: "1",
  costPrice: String(option.costPrice ?? "0"),
});

function lineAmounts(line) {
  const qty = /^\d+$/.test(line.qty.trim()) ? Number(line.qty.trim()) : null;
  const costCents = parseAmount(line.costPrice);
  return { qty, costCents };
}

export function draftTotals(lines) {
  return lines.reduce(
    (totals, line) => {
      const { qty, costCents } = lineAmounts(line);
      if (qty === null || costCents === null) {
        return { ...totals, hasInvalidLine: true };
      }
      return {
        totalQty: totals.totalQty + qty,
        totalCostCents: totals.totalCostCents + qty * costCents,
        hasInvalidLine: totals.hasInvalidLine,
      };
    },
    { totalQty: 0, totalCostCents: 0, hasInvalidLine: false },
  );
}

export function validateDraft({ supplierId = "", lines = [] } = {}) {
  if (!supplierId) {
    return "Choose a supplier.";
  }
  if (lines.length === 0) {
    return "Add at least one product to the order.";
  }
  if (lines.length > MAX_LINES) {
    return `A purchase order can have at most ${MAX_LINES} lines.`;
  }

  for (const line of lines) {
    const { qty, costCents } = lineAmounts(line);
    if (qty === null || qty < 1) {
      return `Enter a whole quantity of 1 or more for ${line.label}.`;
    }
    if (qty > MAX_LINE_QTY) {
      return `The quantity for ${line.label} cannot be more than ${MAX_LINE_QTY}.`;
    }
    if (costCents === null) {
      return `Enter a cost price with up to 2 decimals for ${line.label}.`;
    }
    if (costCents > toCents(99999999.99)) {
      return `The cost price for ${line.label} is too large.`;
    }
  }
  return "";
}

export const draftBody = ({ supplierId, lines }) => ({
  supplierId: Number(supplierId),
  items: lines.map((line) => ({
    variantId: line.variantId,
    qty: Number(line.qty.trim()),
    costPrice: Number(line.costPrice),
  })),
});
