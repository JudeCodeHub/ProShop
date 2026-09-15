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

export function cartTotals(lines, { discountMode = "amount", discountInput = "", taxRate = "0" } = {}) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPriceCents * line.qty, 0);
  const entered = parseAmount(discountInput);

  let discount = 0;
  let discountError = "";
  if (entered === null) {
    discountError = "Enter a number with up to 2 decimals.";
  } else if (discountMode === "percent") {
    if (entered > 10000) {
      discountError = "A percentage discount cannot be more than 100%.";
    } else {
      discount = Math.round((subtotal * entered) / 10000);
    }
  } else if (entered > subtotal) {
    discountError = "The discount cannot be more than the subtotal.";
  } else {
    discount = entered;
  }

  const taxable = subtotal - discount;
  const tax = Math.round((taxable * toCents(taxRate)) / 10000);
  return { subtotal, discount, tax, total: taxable + tax, discountError };
}
