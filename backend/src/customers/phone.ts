export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || /[^\d\s()+.-]/.test(trimmed)) {
    return trimmed;
  }
  const plus = trimmed.startsWith('+') ? '+' : '';
  return `${plus}${trimmed.replace(/\D/g, '')}`;
}

export const digitsOnly = (value: string) => value.replace(/\D/g, '');
