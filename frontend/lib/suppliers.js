export function validateSupplier({ name = "", contactInfo = "" } = {}) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Enter a supplier name.";
  }
  if (trimmed.length > 100) {
    return "A supplier name can be at most 100 characters.";
  }
  if (contactInfo.trim().length > 500) {
    return "Contact details can be at most 500 characters.";
  }
  return "";
}

export function supplierBody({ name = "", contactInfo = "" } = {}) {
  const contact = contactInfo.trim();
  return { name: name.trim(), ...(contact && { contactInfo: contact }) };
}

export function filterSuppliers(suppliers, search = "") {
  const term = search.trim().toLowerCase();
  if (!term) {
    return suppliers;
  }
  return suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(term) ||
      (supplier.contactInfo ?? "").toLowerCase().includes(term),
  );
}
