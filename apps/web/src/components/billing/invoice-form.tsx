'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { createInvoice } from '@/actions/billing';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { INVOICE_SERVICE_PRESETS, formatMoney } from '@sincvete/shared';

interface InvoiceFormProps {
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultConsultationId?: string;
  currency?: string;
  listHref?: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export function InvoiceForm({
  branches,
  defaultBranchId,
  defaultPatientId,
  defaultPatientName,
  defaultOwnerId,
  defaultOwnerName,
  defaultConsultationId,
  currency = 'ARS',
  listHref = '/facturacion',
}: InvoiceFormProps) {
  const [state, formAction, pending] = useActionState(createInvoice, null);
  const [items, setItems] = useState<LineItem[]>([
    { description: INVOICE_SERVICE_PRESETS[0].description, quantity: '1', unitPrice: String(INVOICE_SERVICE_PRESETS[0].unitPrice) },
  ]);

  const applyPreset = (index: number, presetDescription: string) => {
    const preset = INVOICE_SERVICE_PRESETS.find((item) => item.description === presetDescription);
    if (!preset) return;
    setItems((current) =>
      current.map((item, i) =>
        i === index
          ? {
              description: preset.description,
              quantity: item.quantity || '1',
              unitPrice: String(preset.unitPrice),
            }
          : item
      )
    );
  };

  const total = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva factura</CardTitle>
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

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select id="branchId" name="branchId" required defaultValue={defaultBranchId ?? ''}>
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dueAt">Vencimiento</Label>
            <Input id="dueAt" name="dueAt" type="date" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Ítems *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((current) => [...current, { description: '', quantity: '1', unitPrice: '0' }])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                <div className="space-y-2 sm:col-span-12">
                  <Label htmlFor={`preset_${index}`}>Plantilla</Label>
                  <Select
                    id={`preset_${index}`}
                    defaultValue=""
                    onChange={(e) => applyPreset(index, e.target.value)}
                  >
                    <option value="">—</option>
                    {INVOICE_SERVICE_PRESETS.map((preset) => (
                      <option key={preset.description} value={preset.description}>
                        {preset.description}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-6">
                  <Label htmlFor={`description_${index}`}>Descripción *</Label>
                  <Input
                    id={`description_${index}`}
                    name="description"
                    required
                    value={item.description}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, description: e.target.value } : row
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`quantity_${index}`}>Cant.</Label>
                  <Input
                    id={`quantity_${index}`}
                    name="quantity"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, quantity: e.target.value } : row
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor={`unitPrice_${index}`}>Precio</Label>
                  <Input
                    id={`unitPrice_${index}`}
                    name="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, unitPrice: e.target.value } : row
                        )
                      )
                    }
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {state?.fieldErrors?.items?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.items[0]}</p>
            )}
            <p className="text-sm font-medium">Total {formatMoney(total, currency)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando...' : 'Guardar borrador'}
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
