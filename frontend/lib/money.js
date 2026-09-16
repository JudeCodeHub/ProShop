const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const toCents = (value) => Math.round(Number(value) * 100);

export const formatMoney = (cents, currency) =>
  `${currency} ${numberFormat.format(cents / 100)}`;

export function parseAmount(input) {
  const text = String(input ?? "").trim();
  if (text === "") {
    return 0;
  }
  return /^\d+(\.\d{1,2})?$/.test(text) ? toCents(text) : null;
}

export function cartTotals(
  lines,
  { discountMode = "amount", discountInput = "", taxRate = "0", pointsDiscountCents = 0 } = {},
) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPriceCents * line.qty, 0);
  const entered = parseAmount(discountInput);

  let manualDiscount = 0;
  let discountError = "";
  if (entered === null) {
    discountError = "Enter a number with up to 2 decimals.";
  } else if (discountMode === "percent") {
    if (entered > 10000) {
      discountError = "A percentage discount cannot be more than 100%.";
    } else {
      manualDiscount = Math.round((subtotal * entered) / 10000);
    }
  } else if (entered > subtotal) {
    discountError = "The discount cannot be more than the subtotal.";
  } else {
    manualDiscount = entered;
  }

  if (!discountError && manualDiscount + pointsDiscountCents > subtotal) {
    discountError = "The discount plus loyalty points cannot be more than the subtotal.";
  }

  const pointsDiscount = discountError ? 0 : pointsDiscountCents;
  const discount = discountError ? 0 : manualDiscount + pointsDiscount;
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * toCents(taxRate)) / 10000);

  return {
    subtotal,
    manualDiscount: discountError ? 0 : manualDiscount,
    pointsDiscount,
    discount,
    tax,
    total: taxable + tax,
    discountError,
  };
}
