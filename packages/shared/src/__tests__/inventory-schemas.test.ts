import { describe, expect, it } from 'vitest';
import { resolveProductSalePrice, salePriceFromCost } from '../constants/inventory';
import { inventoryMovementSchema, inventoryProductSchema, purchasePartySchema } from '../schemas';

describe('inventoryProductSchema', () => {
  it('validates a product', () => {
    const result = inventoryProductSchema.safeParse({
      name: 'Amoxicilina',
      category: 'medicamento',
      unit: 'caja',
      quantity: 10,
      minQuantity: 2,
      unitCost: '1500.50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unitCost).toBe(1500.5);
    }
  });

  it('rejects a short name', () => {
    const result = inventoryProductSchema.safeParse({
      name: 'A',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it('calculates the sale price from the margin', () => {
    expect(salePriceFromCost(100, 30)).toBe(130);
    expect(resolveProductSalePrice({ unitCost: 10, marginPercent: 50, unitPrice: 1 })).toBe(15);
    expect(resolveProductSalePrice({ unitCost: 10, unitPrice: 18 })).toBe(18);
  });

  it('accepts a cost in USD with margin', () => {
    const result = inventoryProductSchema.safeParse({
      name: 'Vacuna séxtuple',
      category: 'vacuna',
      unit: 'dosis',
      quantity: 0,
      unitCost: '12.5',
      costCurrency: 'USD',
      marginPercent: '40',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.costCurrency).toBe('USD');
      expect(result.data.marginPercent).toBe(40);
    }
  });

  it('converts USD costs to ARS before applying markup and rounding', () => {
    expect(
      resolveProductSalePrice({
        unitCost: 12.5,
        marginPercent: 40,
        costCurrency: 'USD',
        exchangeRate: 1200,
      })
    ).toBe(21000);
    expect(
      resolveProductSalePrice({
        unitCost: 0.1,
        marginPercent: 25,
        costCurrency: 'USD',
        exchangeRate: 1234.5678,
      })
    ).toBe(154.32);
    expect(
      resolveProductSalePrice({ unitCost: 10, marginPercent: 0, costCurrency: 'USD' })
    ).toBeNull();
    expect(
      resolveProductSalePrice({
        unitCost: 10,
        marginPercent: 0,
        costCurrency: 'USD',
        exchangeRate: 0,
      })
    ).toBeNull();
    expect(
      resolveProductSalePrice({
        unitCost: 10,
        unitPrice: 15000,
        costCurrency: 'USD',
        exchangeRate: 1200,
      })
    ).toBe(15000);
  });

  it('rejects negative stock', () => {
    const result = inventoryProductSchema.safeParse({
      name: 'Jeringas',
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('inventoryMovementSchema', () => {
  it('normalizes an optional CUIT without accepting malformed text', () => {
    expect(purchasePartySchema.parse({ name: 'Proveedor', kind: 'proveedor', cuit: '30-12345678-9' }).cuit).toBe('30123456789');
    expect(purchasePartySchema.parse({ name: 'Proveedor', kind: 'proveedor', cuit: '' }).cuit).toBeUndefined();
    expect(purchasePartySchema.safeParse({ name: 'Proveedor', kind: 'proveedor', cuit: '123' }).success).toBe(false);
  });
  it('accepts an entrada', () => {
    const result = inventoryMovementSchema.safeParse({
      movementType: 'entrada',
      quantity: 5,
      lotNumber: 'L-001',
      expiresAt: '2027-01-15',
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const result = inventoryMovementSchema.safeParse({
      movementType: 'salida',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});
