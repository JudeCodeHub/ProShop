import { toCents } from "./money.js";

export function summarizeQuotes(quotes) {
  const refundCents = quotes.reduce((sum, quote) => sum + toCents(quote.refundAmount ?? "0"), 0);
  const dueCents = quotes.reduce((sum, quote) => sum + toCents(quote.amountDue ?? "0"), 0);
  return { refundCents, dueCents, netCents: dueCents - refundCents };
}

export function returnableQty(item) {
  return Math.max(0, item.qty - (item.returnedQty ?? 0));
}
