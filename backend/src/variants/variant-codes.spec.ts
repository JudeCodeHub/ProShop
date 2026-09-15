import { buildBarcode, buildSku, ean13CheckDigit } from './variant-codes.js';

describe('buildSku', () => {
  it('follows PROD-{productId}-{size}-{color} in uppercase', () => {
    expect(buildSku(12, '42', 'Black')).toBe('PROD-12-42-BLACK');
  });

  it('turns spaces and symbols into single dashes', () => {
    expect(buildSku(3, ' 10.5 ', 'navy  blue/white')).toBe('PROD-3-10-5-NAVY-BLUE-WHITE');
  });
});

describe('ean13CheckDigit', () => {
  it('matches a known valid EAN-13', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });
});

describe('buildBarcode', () => {
  it('builds a 13-digit in-store EAN from the variant id', () => {
    const code = buildBarcode(1);
    expect(code).toMatch(/^200\d{10}$/);
    expect(code).toBe('2000000000015');
  });

  it('gives every variant id a different code with a valid check digit', () => {
    const codes = [1, 2, 99, 123456789].map(buildBarcode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(Number(code[12])).toBe(ean13CheckDigit(code.slice(0, 12)));
    }
  });
});
