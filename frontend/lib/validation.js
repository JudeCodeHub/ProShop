import { parseAmount } from "./money.js";

export const MAX_MONEY_CENTS = 9999999999;
export const MAX_STOCK_QTY = 1000000;

const HAS_LETTER_OR_DIGIT = /[A-Za-z0-9]/;

export function textError(value, { label, max, optional = false }) {
  const text = String(value ?? "").trim();
  if (!text) {
    return optional ? "" : `Enter ${label}.`;
  }
  if (text.length > max) {
    return `${label[0].toUpperCase()}${label.slice(1)} can be at most ${max} characters.`;
  }
  return "";
}

export function moneyError(value, { label, optional = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    return optional ? "" : `Enter ${label}.`;
  }
  const cents = parseAmount(text);
  if (cents === null) {
    return `Use a number with up to 2 decimals, like 1250.00`;
  }
  if (cents > MAX_MONEY_CENTS) {
    return `That ${label} is too large.`;
  }
  return "";
}

export function wholeNumberError(value, { label, min = 0, max = MAX_STOCK_QTY, optional = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    return optional ? "" : `Enter ${label}.`;
  }
  if (!/^\d+$/.test(text)) {
    return `Use a whole number, with no decimals.`;
  }
  const number = Number(text);
  if (number < min) {
    return `${label[0].toUpperCase()}${label.slice(1)} must be ${min} or more.`;
  }
  if (number > max) {
    return `${label[0].toUpperCase()}${label.slice(1)} can be at most ${max}.`;
  }
  return "";
}

const keepErrors = (candidates) =>
  Object.fromEntries(Object.entries(candidates).filter(([, message]) => message));

export function validateProduct(values) {
  return keepErrors({
    name: textError(values.name, { label: "a product name", max: 150 }),
    categoryId: values.categoryId ? "" : "Choose a category.",
    brand: textError(values.brand, { label: "a brand", max: 100 }),
    costPrice: moneyError(values.costPrice, { label: "cost price" }),
  });
}

function namePartError(value, { label, max }) {
  const problem = textError(value, { label, max });
  if (problem) {
    return problem;
  }
  return HAS_LETTER_OR_DIGIT.test(String(value)) ? "" : `${label} needs a letter or a number.`;
}

export function validateVariant(values, { withStock = false } = {}) {
  return keepErrors({
    size: namePartError(values.size, { label: "a size", max: 20 }),
    color: namePartError(values.color, { label: "a color", max: 30 }),
    sellPrice: moneyError(values.sellPrice, { label: "selling price" }),
    stockQty: withStock
      ? wholeNumberError(values.stockQty, { label: "starting stock", optional: true })
      : "",
  });
}

export function validateCustomer(values) {
  const phone = String(values.phone ?? "").replace(/[\s-]/g, "");
  const email = String(values.email ?? "").trim();
  return keepErrors({
    name: textError(values.name, { label: "the customer's name", max: 100 }),
    phone: !phone || /^\+?\d{7,15}$/.test(phone) ? "" : "Use 7 to 15 digits, for example 0771234567.",
    email: !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Enter a valid email address.",
  });
}

export function validateAdjustment({ qty, direction, reason, otherReason, stockQty }) {
  const errors = {};
  const qtyProblem = wholeNumberError(qty, { label: "a quantity", min: 1 });
  if (qtyProblem) {
    errors.qty = qtyProblem;
  } else if (direction === "remove" && Number(qty) > stockQty) {
    errors.qty = `You can remove at most ${stockQty}.`;
  }

  const text = reason === "Other" ? String(otherReason ?? "").trim() : String(reason ?? "").trim();
  if (!text) {
    errors.reason = "Enter a reason for the change.";
  } else if (text.length > 200) {
    errors.reason = "A reason can be at most 200 characters.";
  }
  return errors;
}
