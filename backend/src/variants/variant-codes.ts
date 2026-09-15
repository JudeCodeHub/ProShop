const IN_STORE_PREFIX = '200';

const skuPart = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function buildSku(productId: number, size: string, color: string): string {
  return `PROD-${productId}-${skuPart(size)}-${skuPart(color)}`;
}

export function ean13CheckDigit(base12: string): number {
  const sum = base12.split('').reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10;
}

export function buildBarcode(variantId: number): string {
  const base = `${IN_STORE_PREFIX}${String(variantId).padStart(9, '0')}`;
  return `${base}${ean13CheckDigit(base)}`;
}
