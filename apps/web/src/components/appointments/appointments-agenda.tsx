'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarClock, ClipboardList, Plus, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AppointmentMetrics } from '@/components/appointments/appointment-metrics';
import { AppointmentSidePanel } from '@/components/appointments/appointment-side-panel';
import {
  AppointmentsCalendarViews,
  type AgendaViewMode,
} from '@/components/appointments/appointments-calendar-views';
import { AppointmentsWeekNav } from '@/components/appointments/appointments-week-nav';
import { getAgendaDynamicData } from '@/actions/agenda-data';
import type {
  AgendaDynamicData,
  AgendaShellData,
} from '@/components/appointments/agenda-types';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  formatDateParam,
  formatDayLabel,
  getWeekStartDate,
  resolveAgendaCalendarRange,
  shiftAgendaDay,
  shiftAgendaWeek,
  type AppointmentListRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface AppointmentsAgendaProps {
  shell: AgendaShellData;
  initialDynamic: AgendaDynamicData;
  initialSelectedDate: string;
  initialWeekStart: string;
  initialMonth: string;
  initialView: AgendaViewMode;
  initialStatus?: string;
  initialAssignedUserId?: string;
  initialBranchId?: string;
  initialQuery?: string;
}

function getDayKey(isoDate: string): string {
  return formatDateParam(new Date(isoDate));
}

const VIEW_OPTIONS: { value: AgendaViewMode; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

function buildAgendaSearch(
  state: {
    selectedDate: string;
    weekStart: string;
    month: string;
    view: AgendaViewMode;
    status: string;
    assignedUserId: string;
    branchId: string;
    query: string;
  }
): string {
  const params = new URLSearchParams();
  params.set('date', state.selectedDate);
  params.set('week', state.weekStart);
  params.set('month', state.month);
  params.set('view', state.view);
  if (state.status) params.set('status', state.status);
  if (state.assignedUserId) params.set('assigned', state.assignedUserId);
  if (state.branchId) params.set('branch', state.branchId);
  if (state.query) params.set('q', state.query);
  return params.toString();
}

function dynamicCacheKey(input: {
  from: string;
  to: string;
  selectedDate: string;
  branchId?: string;
  status?: string;
  assignedUserId?: string;
  query?: string;
  includeWaitingRoom: boolean;
}): string {
  return [
    input.from,
    input.to,
    input.selectedDate,
    input.branchId ?? '',
    input.status ?? '',
    input.assignedUserId ?? '',
    input.query ?? '',
    input.includeWaitingRoom ? '1' : '0',
  ].join('|');
}

export function AppointmentsAgenda({
  shell,
  initialDynamic,
  initialSelectedDate,
  initialWeekStart,
  initialMonth,
  initialView,
  initialStatus = '',
  initialAssignedUserId = '',
  initialBranchId = '',
  initialQuery = '',
}: AppointmentsAgendaProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [calendarPending, setCalendarPending] = useState(false);
  const [queryDraft, setQueryDraft] = useState(initialQuery);
  const [selected, setSelected] = useState<AppointmentListRow | null>(null);

  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [month, setMonth] = useState(initialMonth);
  const [view, setView] = useState<AgendaViewMode>(initialView);
  const [status, setStatus] = useState(initialStatus);
  const [assignedUserId, setAssignedUserId] = useState(initialAssignedUserId);
  const [branchId, setBranchId] = useState(initialBranchId);
  const [query, setQuery] = useState(initialQuery);
  const [dynamic, setDynamic] = useState<AgendaDynamicData>(initialDynamic);

  const requestIdRef = useRef(0);
  const cacheRef = useRef<Map<string, AgendaDynamicData>>(new Map());

  const {
    canWrite,
    staff,
    branches,
    canStartConsultation,
    canCheckInWaitingRoom,
    canBilling,
    canVaccination,
    canReadWaitingRoom,
  } = shell;

  const appointments = dynamic.appointments;
  const waitingRoomByAppointment = dynamic.waitingRoomByAppointment;
  const waitingRoomWaitingCount = dynamic.waitingRoomWaitingCount;

  const countsByDay = useMemo(
    () =>
      appointments.reduce<Record<string, number>>((acc, appointment) => {
        const day = getDayKey(appointment.starts_at);
        acc[day] = (acc[day] ?? 0) + 1;
        return acc;
      }, {}),
    [appointments]
  );

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => getDayKey(appointment.starts_at) === selectedDate),
    [appointments, selectedDate]
  );

  const selectedWaitingStatus = selected
    ? waitingRoomByAppointment?.[selected.id] ?? null
    : null;

  const syncUrl = (next: {
    selectedDate: string;
    weekStart: string;
    month: string;
    view: AgendaViewMode;
    status: string;
    assignedUserId: string;
    branchId: string;
    query: string;
  }) => {
    const qs = buildAgendaSearch(next);
    window.history.replaceState(window.history.state, '', qs ? `${pathname}?${qs}` : pathname);
  };

  const fetchDynamic = async (
    next: {
      selectedDate: string;
      weekStart: string;
      month: string;
      view: AgendaViewMode;
      status: string;
      assignedUserId: string;
      branchId: string;
      query: string;
    },
    opts?: { prefetchOnly?: boolean }
  ) => {
    const range = resolveAgendaCalendarRange({
      date: next.selectedDate,
      week: next.weekStart,
      month: next.month,
      view: next.view,
    });

    const payload = {
      from: range.from,
      to: range.to,
      weekStart: range.weekStart,
      selectedDate: next.selectedDate,
      branchId: next.branchId || undefined,
      status: next.status || undefined,
      assignedUserId: next.assignedUserId || undefined,
      query: next.query || undefined,
      includeWaitingRoom: canReadWaitingRoom,
    };

    const key = dynamicCacheKey(payload);
    const cached = cacheRef.current.get(key);
    if (cached) {
      if (!opts?.prefetchOnly) setDynamic(cached);
      return cached;
    }

    const requestId = ++requestIdRef.current;
    if (!opts?.prefetchOnly) setCalendarPending(true);

    try {
      const data = await getAgendaDynamicData(payload);
      cacheRef.current.set(key, data);
      // Bound memory for rapid day scrubbing.
      if (cacheRef.current.size > 24) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
      if (!opts?.prefetchOnly && requestId === requestIdRef.current) {
        setDynamic(data);
      }
      return data;
    } finally {
      if (!opts?.prefetchOnly && requestId === requestIdRef.current) {
        setCalendarPending(false);
      }
    }
  };

  const applyState = (
    patch: Partial<{
      selectedDate: string;
      weekStart: string;
      month: string;
      view: AgendaViewMode;
      status: string;
      assignedUserId: string;
      branchId: string;
      query: string;
    }>
  ) => {
    const nextSelectedDate = patch.selectedDate ?? selectedDate;
    const nextView = patch.view ?? view;
    const nextWeekStart =
      patch.weekStart ??
      (patch.selectedDate ? getWeekStartDate(patch.selectedDate) : weekStart);
    const nextMonth = patch.month ?? (patch.selectedDate ? patch.selectedDate.slice(0, 7) : month);

    const next = {
      selectedDate: nextSelectedDate,
      weekStart: nextWeekStart,
      month: nextMonth,
      view: nextView,
      status: patch.status ?? status,
      assignedUserId: patch.assignedUserId ?? assignedUserId,
      branchId: patch.branchId ?? branchId,
      query: patch.query ?? query,
    };

    // Immediate UI response (<100ms perceived).
    startTransition(() => {
      setSelectedDate(next.selectedDate);
      setWeekStart(next.weekStart);
      setMonth(next.month);
      setView(next.view);
      setStatus(next.status);
      setAssignedUserId(next.assignedUserId);
      setBranchId(next.branchId);
      setQuery(next.query);
      if (patch.query !== undefined) setQueryDraft(next.query);
    });

    syncUrl(next);
    void fetchDynamic(next);
  };

  // Prefetch adjacent day/week after settle (skip months).
  useEffect(() => {
    if (calendarPending) return;

    let cancelled = false;

    const run = async () => {
      if (view === 'day') {
        const prevDay = shiftAgendaDay(selectedDate, -1);
        const nextDay = shiftAgendaDay(selectedDate, 1);
        await Promise.all([
          fetchDynamic(
            {
              selectedDate: prevDay,
              weekStart: getWeekStartDate(prevDay),
              month: prevDay.slice(0, 7),
              view: 'day',
              status,
              assignedUserId,
              branchId,
              query,
            },
            { prefetchOnly: true }
          ),
          fetchDynamic(
            {
              selectedDate: nextDay,
              weekStart: getWeekStartDate(nextDay),
              month: nextDay.slice(0, 7),
              view: 'day',
              status,
              assignedUserId,
              branchId,
              query,
            },
            { prefetchOnly: true }
          ),
        ]);
        return;
      }

      if (view === 'week' && !cancelled) {
        const prevWeek = shiftAgendaWeek(weekStart, -1);
        const nextWeek = shiftAgendaWeek(weekStart, 1);
        await Promise.all([
          fetchDynamic(
            {
              selectedDate: prevWeek,
              weekStart: prevWeek,
              month: prevWeek.slice(0, 7),
              view: 'week',
              status,
              assignedUserId,
              branchId,
              query,
            },
            { prefetchOnly: true }
          ),
          fetchDynamic(
            {
              selectedDate: nextWeek,
              weekStart: nextWeek,
              month: nextWeek.slice(0, 7),
              view: 'week',
              status,
              assignedUserId,
              branchId,
              query,
            },
            { prefetchOnly: true }
          ),
        ]);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Intentionally omit fetchDynamic identity; keyed off navigation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDate, weekStart, status, assignedUserId, branchId, query, calendarPending]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    applyState({ query: queryDraft.trim() });
  };

  const isBusy = pending || calendarPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                placeholder="Buscar paciente o tutor..."
                className="pl-8"
                aria-label="Buscar citas"
              />
            </div>
            <Button type="submit" variant="outline" disabled={isBusy}>
              Buscar
            </Button>
          </form>

          <Select
            value={status}
            onChange={(e) => applyState({ status: e.target.value })}
            className="w-full sm:w-44"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            {APPOINTMENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {APPOINTMENT_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>

          <Select
            value={assignedUserId}
            onChange={(e) => applyState({ assignedUserId: e.target.value })}
            className="w-full sm:w-48"
            aria-label="Filtrar por profesional"
          >
            <option value="">Todos los profesionales</option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>

          {branches.length > 1 && (
            <Select
              value={branchId}
              onChange={(e) => applyState({ branchId: e.target.value })}
              className="w-full sm:w-48"
              aria-label="Filtrar por sucursal"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div
            className="inline-flex rounded-lg border p-0.5"
            role="group"
            aria-label="Vista de agenda"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  view === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
                onClick={() => applyState({ view: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/agenda/lista-espera">
              <ClipboardList className="mr-2 h-4 w-4" />
              Lista de espera
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/agenda/disponibilidad">
              <CalendarClock className="mr-2 h-4 w-4" />
              Disponibilidad
            </Link>
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href={`/agenda/nueva?date=${selectedDate}`}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva cita
              </Link>
            </Button>
          )}
        </div>
      </div>

      <AppointmentMetrics
        appointments={dayAppointments}
        waitingRoomWaitingCount={waitingRoomWaitingCount}
      />

      <AppointmentsWeekNav
        weekStart={weekStart}
        selectedDate={selectedDate}
        countsByDay={countsByDay}
        view={view}
        onNavigate={applyState}
      />

      {view === 'day' && (
        <h2 className="text-lg font-semibold">{formatDayLabel(selectedDate)}</h2>
      )}

      <div
        className={cn(
          'relative min-h-[12rem] transition-opacity',
          calendarPending && 'opacity-60'
        )}
        aria-busy={calendarPending || undefined}
      >
        {calendarPending && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
              Actualizando calendario…
            </span>
          </div>
        )}
        <AppointmentsCalendarViews
          view={view}
          appointments={appointments}
          selectedDate={selectedDate}
          weekStart={weekStart}
          month={month}
          staff={staff}
          canWrite={canWrite}
          waitingRoomByAppointment={waitingRoomByAppointment}
          onSelectAppointment={setSelected}
          onNavigate={applyState}
        />
      </div>

      <AppointmentSidePanel
        appointment={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        canWrite={canWrite}
        canStartConsultation={canStartConsultation}
        canCheckInWaitingRoom={canCheckInWaitingRoom}
        canBilling={canBilling}
        canVaccination={canVaccination}
        waitingRoomStatus={selectedWaitingStatus as WaitingRoomStatus | null}
      />
    </div>
  );
}
