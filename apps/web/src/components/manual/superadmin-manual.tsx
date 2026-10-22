import {
  MockEquipoRoles,
  MockSuperadminFeatures,
  MockSuperadminHome,
} from '@/components/manual/superadmin-manual-mocks';

export function SuperadminManual() {
  return (
    <article className="space-y-8 text-sm leading-relaxed">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Qué hace Superadmin</h2>
        <p>
          Superadmin gestiona <strong>clínicas enteras</strong>: plan, extras, módulos, cupos y pagos
          trabados. No asigna permisos a una persona. Eso se hace en la clínica, en Configuración →
          Equipo.
        </p>
        <p>
          Entrás desde el menú <strong>Superadmin</strong> (escudo) a la izquierda, o desde{' '}
          <a className="font-medium text-primary underline" href="/superadmin">
            /superadmin
          </a>
          . Arriba a la derecha está <strong>Volver a la clínica</strong>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">1. Encontrar la clínica</h2>
        <p>
          En <strong>Organizaciones</strong> ves KPIs (trial, activas, pago pendiente, sobre cupos,
          webhooks pendientes). Buscá por nombre o slug, filtrá plan o estado, y abrí la ficha.
        </p>
        <MockSuperadminHome />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">2. Habilitar un módulo a una clínica</h2>
        <p>
          En la ficha, card <strong>Features</strong>. La resolución es: override → extra → plan →
          default. <strong>Activar</strong> o <strong>Desactivar</strong> crea un override. Con{' '}
          <strong>Límite</strong> subís cupos (usuarios, sucursales, veterinarios, pacientes, IA,
          WhatsApp, storage). <strong>Quitar override</strong> vuelve al plan.
        </p>
        <p>
          Ejemplo: para que esa clínica vea WhatsApp, Activá la feature WhatsApp (o otorgá el extra
          WhatsApp, o asigná un plan que lo incluya). El menú de la clínica se actualiza al recargar.
        </p>
        <MockSuperadminFeatures />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">3. Plan, trial y extras</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Suscripción → Cambiar plan:</strong> Basic, Pro, Premium, Enterprise (Legacy solo
            con confirmación). Pedí un motivo. Si supera cupos, marcá asignar igual o elegí un plan
            más alto.
          </li>
          <li>
            <strong>Iniciar trial / Terminar trial:</strong> el trial no es un plan público. Al
            terminar, elegí un plan comercial.
          </li>
          <li>
            <strong>Add-ons → Otorgar add-on:</strong> IA clínica, WhatsApp, Portal del tutor, Imágenes,
            Reportes. Opcional: fecha de vencimiento y motivo. <strong>Quitar</strong> lo revoca.
          </li>
          <li>
            <strong>Acceso temporal:</strong> una feature con desde/hasta, sin cambiar el plan.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">4. Cupos y uso</h2>
        <p>
          <strong>Cupos</strong> muestra ocupación (usuarios, sucursales, veterinarios, pacientes).
          No hay un botón “dar asientos”: subís el límite en Features. <strong>Uso</strong> son
          metros mensuales (IA, WhatsApp, storage). La cola <strong>Sobre cupos</strong> del listado
          es solo lectura.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">5. Pagos trabados</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Liberar</strong> un pago en curso: cancela el checkout para que la clínica no
            quede bloqueada.
          </li>
          <li>
            <strong>Reaplicar</strong> un webhook pendiente: vuelve a aplicar el evento.
          </li>
          <li>
            <strong>Omitir</strong>: no cambia el plan; solo suelta el checkout de ese cobro.
          </li>
          <li>
            <strong>Revertir cobro</strong> del plan o extra: si el proveedor reembolsó y no llegó el
            webhook. No toca legacy ni trial.
          </li>
          <li>
            <strong>Vencer planes/extras y enviar avisos:</strong> corre el ciclo comercial a mano
            (equivalente al cron).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">6. Permisos de un usuario (no está en Superadmin)</h2>
        <p>
          Superadmin no edita roles. Para “habilitarle algo a una persona” hacé las tres capas:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            La <strong>clínica</strong> tiene el módulo (plan, extra u override en Superadmin).
          </li>
          <li>
            La persona está en <strong>Configuración → Equipo</strong>, activa, con un rol.
          </li>
          <li>
            Ese rol incluye el permiso (la matriz de <strong>Configuración → Roles</strong> es de
            consulta: no se edita ahí; cambiás el rol en Equipo).
          </li>
        </ol>
        <p>
          Ejemplo: Lucía no ve Farmacia. 1) En Superadmin, Activá Farmacia para esa clínica. 2) En
          Equipo, ponela Veterinario (no Recepcionista). 3) Recargá. Receta/WhatsApp también piden
          el permiso del rol, no solo el módulo.
        </p>
        <MockEquipoRoles />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">7. Cómo se vuelve Superadmin</h2>
        <p>
          No es un rol de clínica. El email tiene que estar en <code>SUPERADMIN_EMAILS</code>
          (allowlist exclusiva). La tabla <code>platform_admins</code> solo autoriza los RPCs
          después del bootstrap. Equipo nunca otorga Superadmin.
        </p>
      </section>
    </article>
  );
}
