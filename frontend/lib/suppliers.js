import { textError } from "./validation.js";

export function validateSupplier({ name = "", contactInfo = "" } = {}) {
  const errors = {};
  const nameProblem = textError(name, { label: "a supplier name", max: 100 });
  if (nameProblem) {
    errors.name = nameProblem;
  }
  const contactProblem = textError(contactInfo, { label: "contact details", max: 500, optional: true });
  if (contactProblem) {
    errors.contactInfo = contactProblem;
  }
  return errors;
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
