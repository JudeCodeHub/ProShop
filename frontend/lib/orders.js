export const ORDER_STATUSES = ["completed", "held", "voided"];

export const PAYMENT_LABELS = { cash: "Cash", card: "Card", split: "Split" };

export function parseOrderRef(input) {
  const text = String(input ?? "").trim().toUpperCase();
  const match = /^(?:R-|#)?0*(\d{1,10})$/.exec(text);
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return id >= 1 && id <= 2147483647 ? id : null;
}

export function ordersQuery({ from = "", to = "", cashierId = "", status = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cashierId) params.set("cashierId", String(cashierId));
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}
