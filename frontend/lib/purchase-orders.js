import { parseAmount, toCents } from "./money.js";

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
  const errors = { lines: {} };
  if (!supplierId) {
    errors.supplierId = "Choose a supplier.";
  }
  if (lines.length === 0) {
    errors.form = "Add at least one product to the order.";
  } else if (lines.length > MAX_LINES) {
    errors.form = `A purchase order can have at most ${MAX_LINES} lines.`;
  }

  for (const line of lines) {
    const { qty, costCents } = lineAmounts(line);
    const lineErrors = {};
    if (qty === null || qty < 1) {
      lineErrors.qty = "Enter a whole number of 1 or more.";
    } else if (qty > MAX_LINE_QTY) {
      lineErrors.qty = `At most ${MAX_LINE_QTY}.`;
    }
    if (costCents === null) {
      lineErrors.costPrice = "Use a number with up to 2 decimals.";
    } else if (costCents > toCents(99999999.99)) {
      lineErrors.costPrice = "That cost price is too large.";
    }
    if (Object.keys(lineErrors).length > 0) {
      errors.lines[line.variantId] = lineErrors;
    }
  }
  return errors;
}

export const hasDraftErrors = (errors) =>
  Boolean(errors.supplierId || errors.form || Object.keys(errors.lines).length > 0);

export const draftBody = ({ supplierId, lines }) => ({
  supplierId: Number(supplierId),
  items: lines.map((line) => ({
    variantId: line.variantId,
    qty: Number(line.qty.trim()),
    costPrice: Number(line.costPrice),
  })),
});
