import {
  BedDouble,
  Calendar,
  FlaskConical,
  Hourglass,
  Package,
  PawPrint,
  Receipt,
  Scissors,
  Stethoscope,
  Syringe,
  Users,
  Wallet,
} from 'lucide-react';
import { ReportsPeriodFilter } from '@/components/reports/reports-period-filter';
import { ReportsStatGrid } from '@/components/reports/reports-stat-grid';
import { ReportsBreakdownList } from '@/components/reports/reports-breakdown-list';
import { ReportsDailyTable } from '@/components/reports/reports-daily-table';
import { WaitingRoomReportExportButton } from '@/components/reports/waiting-room-report-export-button';
import { SettlementsReportExportButton } from '@/components/reports/settlements-report-export-button';
import {
  APPOINTMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  formatMoney,
  formatWaitMinutes,
  isWaitingRoomStatus,
  type AppointmentStatus,
  type ClinicReport,
  type PaymentMethod,
  type WaitingRoomStatus,
  SETTLEMENT_STATUS_LABELS,
  isSettlementStatus,
  type SettlementStatus,
} from '@sincvete/shared';

interface ReportsViewProps {
  report: ClinicReport;
  currency?: string;
}

export function ReportsView({ report, currency = 'ARS' }: ReportsViewProps) {
  const operations = report.operations;
  const billing = report.billing;
  const inventory = report.inventory;
  const waitingRoom = report.waitingRoom;
  const professionalsSettlements = report.professionalsSettlements;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground">
            Operación, caja e inventario del {report.from} al {report.to}
          </p>
        </div>
        <ReportsPeriodFilter from={report.from} to={report.to} />
      </div>

      {operations && (
        <>
          <ReportsStatGrid
            title="Operación"
            description="Actividad clínica y administrativa del período"
            stats={[
              {
                label: 'Pacientes nuevos',
                value: String(operations.newPatients),
                description: `${operations.newOwners} propietarios`,
                icon: PawPrint,
              },
              {
                label: 'Citas',
                value: String(operations.appointmentsTotal),
                description: `${operations.appointmentsCompleted} completadas · ${operations.appointmentsCancelled} cancel/ausente`,
                icon: Calendar,
              },
              {
                label: 'Consultas',
                value: String(operations.consultationsCompleted),
                description: 'Completadas',
                icon: Stethoscope,
              },
              {
                label: 'Internaciones',
                value: String(operations.hospitalizationsAdmitted),
                description: 'Admisiones',
                icon: BedDouble,
              },
              {
                label: 'Vacunas',
                value: String(operations.vaccinationsRecorded),
                description: 'Dosis registradas',
                icon: Syringe,
              },
              {
                label: 'Cirugías',
                value: String(operations.surgeriesCompleted),
                description: 'Completadas',
                icon: Scissors,
              },
              {
                label: 'Laboratorio',
                value: String(operations.labOrdersCompleted),
                description: 'Órdenes completadas',
                icon: FlaskConical,
              },
              {
                label: 'Propietarios nuevos',
                value: String(operations.newOwners),
                icon: Users,
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportsBreakdownList
              title="Citas por estado"
              items={operations.appointmentsByStatus.map((item) => ({
                label:
                  APPOINTMENT_STATUS_LABELS[item.status as AppointmentStatus] ?? item.status,
                value: String(item.count),
                count: item.count,
              }))}
              emptyLabel="No hay citas en el período."
            />
            <ReportsBreakdownList
              title="Consultas por especie"
              items={operations.consultationsBySpecies.map((item) => ({
                label: `${SPECIES_EMOJI[item.species] ?? ''} ${item.species}`.trim(),
                value: String(item.count),
                count: item.count,
              }))}
              emptyLabel="No hay consultas completadas en el período."
            />
          </div>
        </>
      )}

      {waitingRoom && (
        <>
          <ReportsStatGrid
            title="Sala de espera"
            description="Check-ins y tiempos del período"
            action={<WaitingRoomReportExportButton report={report} />}
            stats={[
              {
                label: 'Check-ins',
                value: String(waitingRoom.checkIns),
                description: `${waitingRoom.called} llamados · ${waitingRoom.removed} quitados`,
                icon: Hourglass,
              },
              {
                label: 'Completados',
                value: String(waitingRoom.completed),
                description: 'Salieron de la cola',
                icon: Hourglass,
              },
              {
                label: 'Hasta llamado',
                value:
                  waitingRoom.avgMinutesToCall != null
                    ? formatWaitMinutes(waitingRoom.avgMinutesToCall)
                    : '—',
                description: 'Promedio check-in → llamado',
                icon: Hourglass,
              },
              {
                label: 'Hasta completar',
                value:
                  waitingRoom.avgMinutesToComplete != null
                    ? formatWaitMinutes(waitingRoom.avgMinutesToComplete)
                    : '—',
                description: 'Promedio check-in → completado',
                icon: Hourglass,
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportsBreakdownList
              title="Cola por estado (activos del período)"
              items={waitingRoom.byStatus.map((item) => ({
                label: isWaitingRoomStatus(item.status)
                  ? WAITING_ROOM_STATUS_LABELS[item.status as WaitingRoomStatus]
                  : item.status,
                value: String(item.count),
                count: item.count,
              }))}
              emptyLabel="No hay entradas activas de sala de espera en el período."
            />
            <ReportsDailyWaitingRoomTable rows={waitingRoom.daily} />
          </div>
        </>
      )}

      {professionalsSettlements && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div />
            <SettlementsReportExportButton report={report} />
          </div>
          <ReportsStatGrid
            title="Liquidaciones a profesionales"
            description="Compensación operativa del período (no nómina legal)"
            stats={[
              {
                label: 'Liquidaciones',
                value: String(professionalsSettlements.settlementsInPeriod),
                description: 'Períodos que intersectan el rango',
                icon: Wallet,
              },
              {
                label: 'Total calculado',
                value: formatMoney(professionalsSettlements.totalCalculated, currency),
                icon: Wallet,
              },
              {
                label: 'Pagado en período',
                value: formatMoney(professionalsSettlements.totalPaidInPeriod, currency),
                icon: Wallet,
              },
              {
                label: 'Saldo pendiente',
                value: formatMoney(professionalsSettlements.totalBalanceDue, currency),
                icon: Wallet,
              },
            ]}
          />
          <ReportsBreakdownList
            title="Liquidaciones por estado"
            items={professionalsSettlements.byStatus.map((item) => ({
              label: isSettlementStatus(item.status)
                ? SETTLEMENT_STATUS_LABELS[item.status as SettlementStatus]
                : item.status,
              value: formatMoney(item.totalAmount, currency),
              count: item.count,
            }))}
            emptyLabel="No hay liquidaciones en el período."
          />
          <ReportsBreakdownList
            title="Liquidaciones por profesional"
            items={professionalsSettlements.byProfessional.map((item) => ({
              label: item.professionalName,
              value: formatMoney(item.totalAmount, currency),
              count: item.count,
            }))}
            emptyLabel="No hay liquidaciones por profesional en el período."
          />
        </>
      )}

      {billing && (
        <>
          <ReportsStatGrid
            title="Caja"
            description="Emisión y cobros del período"
            stats={[
              {
                label: 'Facturado',
                value: formatMoney(billing.invoicesIssuedTotal, currency),
                description: `${billing.invoicesIssuedCount} factura${billing.invoicesIssuedCount !== 1 ? 's' : ''}`,
                icon: Receipt,
              },
              {
                label: 'Cobrado',
                value: formatMoney(billing.paymentsTotal, currency),
                description: `${billing.paymentsCount} pago${billing.paymentsCount !== 1 ? 's' : ''}`,
                icon: Receipt,
              },
              {
                label: 'Por cobrar',
                value: formatMoney(billing.openBalance, currency),
                description: 'Saldo actual de facturas emitidas',
                icon: Receipt,
              },
              {
                label: 'Anuladas',
                value: String(billing.invoicesVoidedCount),
                icon: Receipt,
              },
            ]}
          />
          <ReportsBreakdownList
            title="Cobros por medio"
            items={billing.paymentsByMethod.map((item) => ({
              label: PAYMENT_METHOD_LABELS[item.method as PaymentMethod] ?? item.method,
              value: formatMoney(item.amount, currency),
              count: item.count,
            }))}
            emptyLabel="No hay cobros en el período."
          />
        </>
      )}

      {inventory && (
        <ReportsStatGrid
          title="Inventario"
          description="Movimientos del período y stock bajo actual"
          stats={[
            {
              label: 'Stock bajo',
              value: String(inventory.lowStockCount),
              description: 'Productos activos en o bajo el mínimo',
              icon: Package,
            },
            {
              label: 'Entradas',
              value: String(inventory.movementsEntrada),
              icon: Package,
            },
            {
              label: 'Salidas',
              value: String(inventory.movementsSalida),
              icon: Package,
            },
            {
              label: 'Ajustes / descartes',
              value: String(inventory.movementsAjuste + inventory.movementsDescarte),
              description: `${inventory.movementsAjuste} ajustes · ${inventory.movementsDescarte} descartes`,
              icon: Package,
            },
          ]}
        />
      )}

      <ReportsDailyTable
        rows={report.daily}
        showPayments={Boolean(billing)}
        currency={currency}
      />
    </div>
  );
}

function ReportsDailyWaitingRoomTable({
  rows,
}: {
  rows: NonNullable<ClinicReport['waitingRoom']>['daily'];
}) {
  const activeDays = rows.filter((row) => row.checkIns > 0 || row.completed > 0);

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h3 className="font-medium">Sala de espera por día</h3>
        <p className="text-sm text-muted-foreground">Check-ins y completados</p>
      </div>
      <div className="px-4 py-3">
        {activeDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividad de sala en el período.</p>
        ) : (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Día</th>
                  <th className="py-2 pr-4 font-medium">Check-ins</th>
                  <th className="py-2 font-medium">Completados</th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((row) => (
                  <tr key={row.day} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.day}</td>
                    <td className="py-2 pr-4">{row.checkIns}</td>
                    <td className="py-2">{row.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
