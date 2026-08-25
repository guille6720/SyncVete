'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { createPrescription, searchPharmacyProducts } from '@/actions/pharmacy';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  MEDICATION_PRESETS,
  PRESCRIPTION_FREQUENCIES,
  PRESCRIPTION_ROUTES,
  PRESCRIPTION_ROUTE_LABELS,
} from '@sincvete/shared';

interface PrescriptionFormProps {
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultConsultationId?: string;
  listHref?: string;
}

interface LineItem {
  medicationName: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  productId: string;
  productLabel: string;
  instructions: string;
}

const EMPTY_ITEM: LineItem = {
  medicationName: '',
  dose: '',
  frequency: 'cada 12 h',
  duration: '7 días',
  route: 'oral',
  quantity: '0',
  productId: '',
  productLabel: '',
  instructions: '',
};

export function PrescriptionForm({
  branches,
  defaultBranchId,
  defaultPatientId,
  defaultPatientName,
  defaultOwnerId,
  defaultOwnerName,
  defaultConsultationId,
  listHref = '/farmacia',
}: PrescriptionFormProps) {
  const [state, formAction, pending] = useActionState(createPrescription, null);
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const sessionBranch = branches.find((branch) => branch.id === defaultBranchId);

  const applyPreset = (index: number, presetId: string) => {
    const preset = MEDICATION_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setItems((current) =>
      current.map((item, i) =>
        i === index
          ? {
              ...item,
              medicationName: preset.name,
              dose: preset.dose,
              frequency: preset.frequency,
              duration: preset.duration,
              route: preset.route,
            }
          : item
      )
    );
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva receta</CardTitle>
        {sessionBranch ? (
          <p className="text-sm text-muted-foreground">
            Se crea en la sucursal de tu sesión: {sessionBranch.name}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-3xl gap-4">
          {defaultConsultationId && (
            <input type="hidden" name="consultationId" value={defaultConsultationId} />
          )}

          <PatientPicker
            defaultPatientId={defaultPatientId}
            defaultPatientName={defaultPatientName}
            defaultOwnerId={defaultOwnerId}
            defaultOwnerName={defaultOwnerName}
            error={state?.fieldErrors?.patientId?.[0] ?? state?.fieldErrors?.ownerId?.[0]}
          />

          {sessionBranch ? (
            <input type="hidden" name="branchId" value={sessionBranch.id} />
          ) : branches.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select id="branchId" name="branchId" required defaultValue="">
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Medicamentos *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                <input type="hidden" name="productId" value={item.productId} />
                <div className="space-y-2 sm:col-span-12">
                  <Label htmlFor={`preset_${index}`}>Plantilla</Label>
                  <Select
                    id={`preset_${index}`}
                    defaultValue=""
                    onChange={(e) => applyPreset(index, e.target.value)}
                  >
                    <option value="">—</option>
                    {MEDICATION_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-8">
                  <Label htmlFor={`medicationName_${index}`}>Medicamento *</Label>
                  <Input
                    id={`medicationName_${index}`}
                    name="medicationName"
                    required
                    value={item.medicationName}
                    onChange={(e) => updateItem(index, { medicationName: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label htmlFor={`quantity_${index}`}>Cant. a dispensar</Label>
                  <Input
                    id={`quantity_${index}`}
                    name="quantity"
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label htmlFor={`dose_${index}`}>Dosis *</Label>
                  <Input
                    id={`dose_${index}`}
                    name="dose"
                    required
                    value={item.dose}
                    onChange={(e) => updateItem(index, { dose: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label htmlFor={`frequency_${index}`}>Frecuencia *</Label>
                  <Select
                    id={`frequency_${index}`}
                    name="frequency"
                    value={item.frequency}
                    onChange={(e) => updateItem(index, { frequency: e.target.value })}
                  >
                    {PRESCRIPTION_FREQUENCIES.map((frequency) => (
                      <option key={frequency} value={frequency}>
                        {frequency}
                      </option>
                    ))}
                    {!PRESCRIPTION_FREQUENCIES.includes(
                      item.frequency as (typeof PRESCRIPTION_FREQUENCIES)[number]
                    ) &&
                      item.frequency && <option value={item.frequency}>{item.frequency}</option>}
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label htmlFor={`duration_${index}`}>Duración</Label>
                  <Input
                    id={`duration_${index}`}
                    name="duration"
                    value={item.duration}
                    onChange={(e) => updateItem(index, { duration: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label htmlFor={`route_${index}`}>Vía *</Label>
                  <Select
                    id={`route_${index}`}
                    name="route"
                    value={item.route}
                    onChange={(e) => updateItem(index, { route: e.target.value })}
                  >
                    {PRESCRIPTION_ROUTES.map((route) => (
                      <option key={route} value={route}>
                        {PRESCRIPTION_ROUTE_LABELS[route]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-8">
                  <Label htmlFor={`instructions_${index}`}>Indicaciones</Label>
                  <Input
                    id={`instructions_${index}`}
                    name="instructions"
                    value={item.instructions}
                    onChange={(e) => updateItem(index, { instructions: e.target.value })}
                    placeholder="Con comida, no dar si vomita..."
                  />
                </div>
                <div className="sm:col-span-12">
                  <InventoryProductSearch
                    label={item.productLabel}
                    onSelect={(product) =>
                      updateItem(index, {
                        productId: product.id,
                        productLabel: `${product.name} · stock ${product.quantity} ${product.unit}`,
                        medicationName: item.medicationName || product.name,
                        quantity: item.quantity === '0' ? '1' : item.quantity,
                      })
                    }
                    onClear={() => updateItem(index, { productId: '', productLabel: '' })}
                  />
                </div>
                {items.length > 1 && (
                  <div className="sm:col-span-12">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Quitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {state?.fieldErrors?.items?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.items[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" isPending={pending}>
              {pending ? 'Creando...' : 'Crear receta'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function InventoryProductSearch({
  label,
  onSelect,
  onClear,
}: {
  label: string;
  onSelect: (product: { id: string; name: string; quantity: number; unit: string }) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const [results, setResults] = useState<
    Array<{ id: string; name: string; quantity: number; unit: string }>
  >([]);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void searchPharmacyProducts(debounced).then((rows) => {
      if (!cancelled) setResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="space-y-2">
      <Label>Producto de inventario (opcional)</Label>
      {label ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Quitar vínculo
          </Button>
        </div>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en stock para descontar al dispensar"
          />
          {results.length > 0 && (
            <div className="rounded-md border">
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() => {
                    onSelect(product);
                    setQuery('');
                    setResults([]);
                  }}
                >
                  {product.name}
                  <span className="ml-2 text-muted-foreground">
                    stock {product.quantity} {product.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
