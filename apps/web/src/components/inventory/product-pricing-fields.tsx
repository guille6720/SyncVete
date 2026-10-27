'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  PRODUCT_CURRENCIES,
  PRODUCT_CURRENCY_LABELS,
  formatProductAmount,
  salePriceFromCost,
  type ProductCurrency,
} from '@sincvete/shared';

interface ProductPricingFieldsProps {
  defaultCost?: number | null;
  defaultPrice?: number | null;
  defaultCurrency?: ProductCurrency;
  defaultMargin?: number | null;
}

export function ProductPricingFields({
  defaultCost = null,
  defaultPrice = null,
  defaultCurrency = 'ARS',
  defaultMargin = null,
}: ProductPricingFieldsProps) {
  const [currency, setCurrency] = useState<ProductCurrency>(defaultCurrency);
  const [cost, setCost] = useState(defaultCost == null ? '' : String(defaultCost));
  const [margin, setMargin] = useState(defaultMargin == null ? '' : String(defaultMargin));
  const [manualPrice, setManualPrice] = useState(defaultPrice == null ? '' : String(defaultPrice));

  const costNumber = cost === '' ? null : Number(cost);
  const marginNumber = margin === '' ? null : Number(margin);
  const computed =
    costNumber != null &&
    marginNumber != null &&
    Number.isFinite(costNumber) &&
    Number.isFinite(marginNumber)
      ? salePriceFromCost(costNumber, marginNumber)
      : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="costCurrency">Moneda</Label>
        <Select
          id="costCurrency"
          name="costCurrency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as ProductCurrency)}
        >
          {PRODUCT_CURRENCIES.map((item) => (
            <option key={item} value={item}>
              {PRODUCT_CURRENCY_LABELS[item]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="unitCost">Costo</Label>
        <Input
          id="unitCost"
          name="unitCost"
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(event) => setCost(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="marginPercent">% de ganancia</Label>
        <Input
          id="marginPercent"
          name="marginPercent"
          type="number"
          min="0"
          max="1000"
          step="0.01"
          value={margin}
          onChange={(event) => setMargin(event.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="unitPrice">Precio de venta</Label>
        {computed != null ? (
          <>
            <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
              {formatProductAmount(computed, currency)}
            </p>
            <input type="hidden" name="unitPrice" value={computed} />
          </>
        ) : (
          <Input
            id="unitPrice"
            name="unitPrice"
            type="number"
            min="0"
            step="0.01"
            value={manualPrice}
            onChange={(event) => setManualPrice(event.target.value)}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {computed != null
            ? 'Sale del costo más el porcentaje de ganancia.'
            : 'Si cargás un porcentaje, el precio de venta se calcula solo.'}
        </p>
      </div>
    </div>
  );
}
