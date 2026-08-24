'use client';

import { Command } from 'cmdk';
import {
  BedDouble,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Package,
  PawPrint,
  Receipt,
  Scissors,
  Search,
  Settings,
  Shield,
  Stethoscope,
  Syringe,
  Users,
  Bell,
  Sparkles,
  MessageCircle,
  Pill,
  Banknote,
  Images,
  Inbox,
  ScrollText,
  Hourglass,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { isClinicPathEntitled } from '@sincvete/shared';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: 'inicio home' },
  { label: 'Agenda', href: '/agenda', icon: Calendar, keywords: 'citas turnos calendario' },
  {
    label: 'Sala de espera',
    href: '/sala-espera',
    icon: Hourglass,
    keywords: 'cola checkin llamado recepcion espera',
  },
  { label: 'Pacientes', href: '/pacientes', icon: PawPrint, keywords: 'mascotas animales' },
  { label: 'Propietarios', href: '/propietarios', icon: Users, keywords: 'clientes tutores' },
  { label: 'Historia clínica', href: '/historia-clinica', icon: ClipboardList, keywords: 'historia clinica evolucion' },
  { label: 'Imágenes', href: '/imagenes', icon: Images, keywords: 'fotos radiografia ecografia estudios galeria' },
  { label: 'Consultas', href: '/consultas', icon: Stethoscope, keywords: 'atencion clinica' },
  { label: 'Internación', href: '/internacion', icon: BedDouble, keywords: 'internados hospital jaula box' },
  { label: 'Vacunación', href: '/vacunacion', icon: Syringe, keywords: 'vacunas refuerzo antirrabica' },
  { label: 'Cirugías', href: '/cirugias', icon: Scissors, keywords: 'quirófano operacion castracion' },
  { label: 'Laboratorio', href: '/laboratorio', icon: FlaskConical, keywords: 'lab hemograma analisis resultados' },
  { label: 'Inventario', href: '/inventario', icon: Package, keywords: 'stock farmacia productos insumos' },
  { label: 'Farmacia', href: '/farmacia', icon: Pill, keywords: 'receta recetar medicamento dispensar' },
  { label: 'Facturación', href: '/facturacion', icon: Receipt, keywords: 'factura cobro caja pagos' },
  { label: 'Caja', href: '/caja', icon: Banknote, keywords: 'caja turno efectivo cierre cobros' },
  { label: 'Reportes', href: '/reportes', icon: BarChart3, keywords: 'estadisticas caja operacion' },
  { label: 'Auditoría', href: '/auditoria', icon: ScrollText, keywords: 'logs cambios historial actividad' },
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, keywords: 'mensaje tutor whatsapp wa' },
  { label: 'Recordatorios', href: '/recordatorios', icon: Bell, keywords: 'avisos turnos vacunas saldos' },
  { label: 'Notificaciones', href: '/notificaciones', icon: Inbox, keywords: 'avisos campana inbox laboratorio stock' },
  { label: 'IA clínica', href: '/ia-clinica', icon: Sparkles, keywords: 'inteligencia artificial resumen soap tutor' },
  { label: 'Configuración', href: '/configuracion', icon: Settings, keywords: 'ajustes settings' },
  { label: 'Manual de uso', href: '/manual', icon: BookOpen, keywords: 'ayuda guia descargar pdf instrucciones' },
] as const;

const QUICK_ACTIONS = [
  { label: 'Nuevo paciente', href: '/pacientes/nuevo', keywords: 'crear mascota animal' },
  { label: 'Nuevo propietario', href: '/propietarios/nuevo', keywords: 'crear tutor cliente' },
  { label: 'Nueva cita', href: '/agenda/nueva', keywords: 'agendar turno cita' },
  { label: 'Nueva entrada clínica', href: '/historia-clinica/nuevo', keywords: 'historia clinica evolucion' },
  { label: 'Nueva consulta', href: '/consultas/nueva', keywords: 'atencion consulta' },
  { label: 'Admitir internación', href: '/internacion/nueva', keywords: 'internar hospitalizar' },
  { label: 'Registrar vacuna', href: '/vacunacion/nueva', keywords: 'vacunar dosis refuerzo' },
  { label: 'Programar cirugía', href: '/cirugias/nueva', keywords: 'operar quirofano castracion' },
  { label: 'Nueva orden de laboratorio', href: '/laboratorio/nueva', keywords: 'lab hemograma bioquimica' },
  { label: 'Nuevo producto de inventario', href: '/inventario/nuevo', keywords: 'stock farmacia producto' },
  { label: 'Nueva receta', href: '/farmacia/nueva', keywords: 'prescribir medicamento farmacia recetar' },
  { label: 'Subir imagen', href: '/imagenes/nueva', keywords: 'foto radiografia ecografia documento galeria' },
  { label: 'Nueva factura', href: '/facturacion/nueva', keywords: 'cobrar factura caja' },
  { label: 'Caja', href: '/caja', keywords: 'abrir caja efectivo cierre turno' },
  { label: 'Ver reportes', href: '/reportes', keywords: 'estadisticas caja operacion' },
  { label: 'Auditoría', href: '/auditoria', keywords: 'logs cambios historial actividad' },
  { label: 'WhatsApp', href: '/whatsapp', keywords: 'mensaje tutor whatsapp' },
  { label: 'Recordatorios', href: '/recordatorios', keywords: 'avisos turnos vacunas saldos' },
  { label: 'Notificaciones', href: '/notificaciones', keywords: 'avisos campana inbox laboratorio stock' },
  { label: 'IA clínica', href: '/ia-clinica', keywords: 'resumen soap indicaciones inteligencia' },
] as const;

const PREFETCH_ON_OPEN = [
  '/dashboard',
  '/agenda',
  '/pacientes',
  '/historia-clinica',
  '/consultas',
  '/farmacia',
  '/pacientes/nuevo',
  '/agenda/nueva',
  '/farmacia/nueva',
  '/consultas/nueva',
  '/historia-clinica/nuevo',
] as const;

export function CommandPalette({
  entitledHrefs = null,
  isPlatformAdmin = false,
}: {
  entitledHrefs?: string[] | null;
  isPlatformAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      startTransition(() => {
        router.push(href);
      });
    },
    [router, startTransition]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    for (const href of PREFETCH_ON_OPEN) {
      router.prefetch(href);
    }
  }, [open, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar command palette"
        onClick={() => setOpen(false)}
      />
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2 px-4">
        <Command
          className="overflow-hidden rounded-lg border bg-card shadow-2xl"
          label="Command palette"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Buscar módulos, acciones..."
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs sm:inline">ESC</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados.
            </Command.Empty>

            <Command.Group heading="Navegación" className="px-1 py-1.5 text-xs font-medium text-muted-foreground">
              {NAV_ITEMS.filter((item) => isClinicPathEntitled(item.href, entitledHrefs)).map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => navigate(item.href)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                    'aria-selected:bg-accent aria-selected:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Command.Item>
              ))}
              {isPlatformAdmin ? (
                <Command.Item
                  value="Guía Superadmin manual permisos habilitar clinica"
                  onSelect={() => navigate('/configuracion?tab=guia-superadmin')}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                    'aria-selected:bg-accent aria-selected:text-accent-foreground'
                  )}
                >
                  <Shield className="h-4 w-4" />
                  Guía Superadmin
                </Command.Item>
              ) : null}
            </Command.Group>

            <Command.Group heading="Acciones rápidas" className="px-1 py-1.5 text-xs font-medium text-muted-foreground">
              {QUICK_ACTIONS.filter((item) => isClinicPathEntitled(item.href, entitledHrefs)).map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => navigate(item.href)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                    'aria-selected:bg-accent aria-selected:text-accent-foreground'
                  )}
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
      onClick={() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      }}
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Buscar...</span>
      <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs md:inline">⌘K</kbd>
    </button>
  );
}
