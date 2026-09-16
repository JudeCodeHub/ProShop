export function settingsForm(settings) {
  return {
    storeName: settings?.storeName ?? "",
    address: settings?.address ?? "",
    logoUrl: settings?.logoUrl ?? "",
    taxRate: settings?.taxRate ?? "0.00",
    currency: settings?.currency ?? "LKR",
    receiptFooterText: settings?.receiptFooterText ?? "",
  };
}

export function validateSettings(form) {
  const errors = {};
  const name = form.storeName.trim();
  if (!name) {
    errors.storeName = "Enter the store name.";
  } else if (name.length > 100) {
    errors.storeName = "The store name can be at most 100 characters.";
  }

  if (form.address.trim().length > 300) {
    errors.address = "The address can be at most 300 characters.";
  }

  const logoUrl = form.logoUrl.trim();
  if (logoUrl && !/^https?:\/\/\S+$/.test(logoUrl)) {
    errors.logoUrl = "Enter a link that starts with http:// or https://";
  } else if (logoUrl.length > 500) {
    errors.logoUrl = "The logo link can be at most 500 characters.";
  }

  const taxRate = form.taxRate.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(taxRate)) {
    errors.taxRate = "Enter a tax rate like 15 or 15.50.";
  } else if (Number(taxRate) > 100) {
    errors.taxRate = "The tax rate cannot be more than 100%.";
  }

  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    errors.currency = "Enter a 3 letter currency code like LKR or USD.";
  }

  if (form.receiptFooterText.trim().length > 300) {
    errors.receiptFooterText = "The receipt footer can be at most 300 characters.";
  }

  return errors;
}

export function settingsBody(form) {
  const optional = (value) => {
    const text = value.trim();
    return text === "" ? undefined : text;
  };
  return {
    storeName: form.storeName.trim(),
    address: optional(form.address),
    logoUrl: optional(form.logoUrl),
    taxRate: Number(form.taxRate.trim()),
    currency: form.currency.trim().toUpperCase(),
    receiptFooterText: optional(form.receiptFooterText),
  };
}
