import type { ReactNode } from 'react';
import {
  MockEquipoRoles,
  MockSuperadminAccess,
  MockSuperadminAddons,
  MockSuperadminBillingQueues,
  MockSuperadminFeatures,
  MockSuperadminHome,
  MockSuperadminMigration,
  MockSuperadminOrgRecommendation,
  MockSuperadminRecommendations,
  MockSuperadminSubscription,
} from '@/components/manual/superadmin-manual-mocks';

const LOGO = '/brand/logo.png';

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO}
      alt="SyncVete"
      width={120}
      height={120}
      style={{ height: 56, width: 'auto', borderRadius: 8 }}
    />
  );
}

export function SuperadminManual({ toolbar }: { toolbar?: ReactNode }) {
  return (
    <div className="sv-manual">
      {toolbar}
      <header className="sv-cover sv-cover-superadmin">
        <div className="sv-cover-badge" aria-hidden>
          SA
        </div>
        <div>
          <Logo />
          <span className="sv-kicker">Manual exclusivo · Superadmin</span>
          <h1>Operar la plataforma clínica a clínica</h1>
          <p>
            Guía paso a paso de todo el panel Superadmin: acceso, organizaciones, planes, extras,
            features, cupos, pagos, recomendaciones comerciales, migración e import/export. No es el
            manual de la clínica.
          </p>
        </div>
      </header>

      <nav className="sv-toc" aria-label="Índice Superadmin">
        <a href="#sa-acceso">1. Acceso y alcance</a>
        <a href="#sa-home">2. Home y KPIs</a>
        <a href="#sa-buscar">3. Buscar y abrir una clínica</a>
        <a href="#sa-plan">4. Plan, trial y legacy</a>
        <a href="#sa-addons">5. Add-ons (extras)</a>
        <a href="#sa-features">6. Features y cupos</a>
        <a href="#sa-pagos">7. Pagos y webhooks</a>
        <a href="#sa-recs">8. Recomendaciones comerciales</a>
        <a href="#sa-colas">9. Colas, digest y bulk</a>
        <a href="#sa-migracion">10. Import / Export ops</a>
        <a href="#sa-equipo">11. Qué NO se hace en Superadmin</a>
        <a href="#sa-checklist">12. Checklists rápidos</a>
      </nav>

      <section className="sv-section" id="sa-acceso">
        <h2>1. Acceso y alcance</h2>
        <p>
          Superadmin gestiona <strong>clínicas enteras</strong> (organización): plan, extras, módulos,
          cupos y pagos trabados. <strong>No</strong> asigna permisos a una persona de esa clínica.
        </p>
        <h3>Cómo entrar</h3>
        <ol className="sv-steps">
          <li>Iniciá sesión con un email listado en <code>SUPERADMIN_EMAILS</code> (Vercel).</li>
          <li>
            En el menú izquierdo tocá el ítem con escudo <strong>Superadmin</strong>, o andá a{' '}
            <code>/superadmin</code>.
          </li>
          <li>
            Arriba a la derecha está <strong>Volver a la clínica</strong> para salir del contexto
            plataforma.
          </li>
          <li>
            Esta guía también está en <strong>Configuración → Guía Superadmin</strong> (solo la ves
            vos) y en <code>/manual/superadmin</code>.
          </li>
        </ol>
        <MockSuperadminAccess />
        <h3>Si no carga el panel</h3>
        <ul>
          <li>
            Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en Vercel → agregala y redesplegá.
          </li>
          <li>
            Faltan migraciones de recomendaciones (phase 31–60) en Supabase → aplicá el SQL y
            recargá.
          </li>
        </ul>
      </section>

      <section className="sv-section" id="sa-home">
        <h2>2. Home y KPIs</h2>
        <p>
          La home (<code>/superadmin</code>) resume el estado comercial de todas las clínicas y
          concentra las colas de trabajo.
        </p>
        <ol className="sv-steps">
          <li>
            Revisá las tarjetas: clínicas, trial, activas, pago pendiente, vencidas, planes/extras por
            vencer, sobre cupos, webhooks pendientes, pagos en curso.
          </li>
          <li>
            Si un KPI tiene número y enlace, tocá para saltar a la cola correspondiente (ancla en la
            misma página).
          </li>
          <li>
            <strong>Ejecutar ciclo comercial:</strong> vence planes/extras vencidos y dispara avisos
            (equivalente al cron). No cambia planes solo.
          </li>
          <li>
            <strong>Actualizar recomendaciones:</strong> recalcula sugerencias de plan para todas las
            clínicas. Tampoco cambia el plan automáticamente.
          </li>
        </ol>
        <MockSuperadminHome />
      </section>

      <section className="sv-section" id="sa-buscar">
        <h2>3. Buscar y abrir una clínica</h2>
        <ol className="sv-steps">
          <li>Bajá hasta el listado <strong>Organizaciones</strong>.</li>
          <li>
            Filtrá por búsqueda (nombre o slug), plan, estado, plan sugerido, filtro de upgrade u
            orden.
          </li>
          <li>
            Tocá la fila o <strong>Abrir ficha</strong> → vas a{' '}
            <code>/superadmin/organizaciones/[id]</code>.
          </li>
          <li>
            En la ficha ves suscripción, add-ons, features, cupos, uso, recomendación, pagos e
            import/export de esa clínica.
          </li>
        </ol>
      </section>

      <section className="sv-section" id="sa-plan">
        <h2>4. Plan, trial y legacy</h2>
        <p>En la ficha, card <strong>Suscripción</strong>.</p>
        <h3>Cambiar plan</h3>
        <ol className="sv-steps">
          <li>Elegí Basic, Pro, Premium o Enterprise.</li>
          <li>Escribí un <strong>motivo</strong> (queda auditado).</li>
          <li>
            Si la clínica ya supera los cupos del plan destino, marcá{' '}
            <strong>Asignar igual si supera cupos</strong> o elegí un plan más alto.
          </li>
          <li>
            Legacy solo con confirmación explícita (<strong>Confirmo asignar legacy</strong>).
          </li>
          <li>Guardar plan.</li>
        </ol>
        <h3>Trial</h3>
        <ol className="sv-steps">
          <li>
            <strong>Iniciar trial:</strong> días opcionales (vacío = abierto) + motivo.
          </li>
          <li>
            <strong>Terminar trial:</strong> elegí el plan comercial de destino + motivo.
          </li>
        </ol>
        <h3>Revertir cobro del plan</h3>
        <p>
          Si Mercado Pago / Stripe reembolsó y el webhook no llegó. No toca legacy ni trial.
        </p>
        <MockSuperadminSubscription />
      </section>

      <section className="sv-section" id="sa-addons">
        <h2>5. Add-ons (extras)</h2>
        <p>
          Extras sobre el plan (IA clínica, WhatsApp, Portal del tutor, Imágenes, Reportes). No hay
          checkout: los otorga Superadmin.
        </p>
        <ol className="sv-steps">
          <li>En la ficha, card <strong>Add-ons</strong>.</li>
          <li>
            <strong>Otorgar add-on:</strong> elegí el extra, fecha de vencimiento opcional y motivo.
          </li>
          <li>
            <strong>Quitar:</strong> revoca el extra; deja de sumar features.
          </li>
          <li>
            Un add-on vencido o cancelado deja de aplicar aunque siga visible en historial.
          </li>
        </ol>
        <MockSuperadminAddons />
      </section>

      <section className="sv-section" id="sa-features">
        <h2>6. Features y cupos</h2>
        <p>
          Resolución de cada feature:{' '}
          <strong>override → extra → plan → default</strong>.
        </p>
        <ol className="sv-steps">
          <li>En la ficha, card <strong>Features</strong>.</li>
          <li>
            <strong>Activar / Desactivar:</strong> crea un override para esa clínica.
          </li>
          <li>
            <strong>Límite:</strong> subí cupos (usuarios, sucursales, veterinarios, pacientes, IA,
            WhatsApp, storage).
          </li>
          <li>
            <strong>Quitar override:</strong> vuelve a lo que diga el plan/extra.
          </li>
          <li>
            <strong>Acceso temporal:</strong> feature con desde/hasta sin cambiar el plan.
          </li>
        </ol>
        <p>
          Ejemplo: para que la clínica vea WhatsApp → Activá WhatsApp, o otorgá el add-on WhatsApp, o
          asigná un plan que lo incluya. El menú de la clínica se actualiza al recargar.
        </p>
        <p>
          La card <strong>Cupos</strong> muestra ocupación. No hay botón “dar asientos”: subís el
          límite en Features. <strong>Uso</strong> son metros mensuales (IA, WhatsApp, storage).
        </p>
        <MockSuperadminFeatures />
      </section>

      <section className="sv-section" id="sa-pagos">
        <h2>7. Pagos y webhooks</h2>
        <p>
          En la home (colas comerciales) y también en la ficha de la clínica cuando hay intents o
          eventos.
        </p>
        <ol className="sv-steps">
          <li>
            <strong>Liberar</strong> un pago en curso: cancela el checkout para que la clínica no
            quede bloqueada.
          </li>
          <li>
            <strong>Reaplicar</strong> un webhook pendiente: vuelve a aplicar el evento de billing.
          </li>
          <li>
            <strong>Omitir:</strong> no cambia el plan; solo suelta ese cobro trabado.
          </li>
          <li>
            <strong>Revertir cobro</strong> (plan o extra): cuando el proveedor reembolsó y no llegó
            el webhook.
          </li>
          <li>
            <strong>Ejecutar ciclo comercial</strong> en la home si necesitás vencer y avisar a mano.
          </li>
        </ol>
        <MockSuperadminBillingQueues />
      </section>

      <section className="sv-section" id="sa-recs">
        <h2>8. Recomendaciones comerciales</h2>
        <p>
          El motor sugiere upgrades (Basic→Pro, etc.) según uso y señales. <strong>Nunca</strong>{' '}
          cambia el plan solo: es trabajo humano.
        </p>
        <h3>En la ficha de la clínica</h3>
        <ol className="sv-steps">
          <li>Revisá plan sugerido, severidad y motivos.</li>
          <li>
            <strong>Asignar</strong> responsable comercial.
          </li>
          <li>
            Cargá <strong>follow-up</strong> (fecha).
          </li>
          <li>
            Registrá <strong>outcome</strong>: won / lost / deferred / not_a_fit.
          </li>
          <li>
            Agregá <strong>tags</strong> y notas comerciales.
          </li>
          <li>
            Opcional: <strong>snooze</strong> comercial o congelar mientras no haya movimiento.
          </li>
        </ol>
        <MockSuperadminOrgRecommendation />
        <h3>En la home</h3>
        <ol className="sv-steps">
          <li>
            <strong>Prioridad:</strong> cola ordenada; filtros “solo mías”, incluir congeladas /
            snooze.
          </li>
          <li>
            <strong>Actualizar recomendaciones</strong> cuando cambió el uso de muchas clínicas.
          </li>
        </ol>
        <MockSuperadminRecommendations />
      </section>

      <section className="sv-section" id="sa-colas">
        <h2>9. Colas, digest, analytics y bulk</h2>
        <p>Bloques de la home (de arriba hacia abajo, en la práctica):</p>
        <ul>
          <li>
            <strong>Vistas guardadas:</strong> guardá filtros comerciales (assignee, tag, aging,
            etc.) y reabrilos.
          </li>
          <li>
            <strong>Settings de recomendaciones:</strong> umbrales / parámetros del motor (si están
            expuestos).
          </li>
          <li>
            <strong>Priority queue / Snooze board:</strong> trabajo del día y pausas.
          </li>
          <li>
            <strong>Funnel / Trends / Aging:</strong> embudo, tendencia y envejecimiento de
            oportunidades.
          </li>
          <li>
            <strong>Assignee scorecard / workload:</strong> rendimiento y carga por comercial.
          </li>
          <li>
            <strong>Tag scorecard / Tags board:</strong> clínicas por etiqueta.
          </li>
          <li>
            <strong>Activity feed:</strong> actividad reciente (filtro “mías”).
          </li>
          <li>
            <strong>Note search:</strong> buscá texto en notas (mín. 2 caracteres).
          </li>
          <li>
            <strong>Open pipeline:</strong> pipeline abierto con orden (edad, severidad, nombre,
            follow-up).
          </li>
          <li>
            <strong>Digest:</strong> sin contacto, follow-ups vencidos, etc.
          </li>
          <li>
            <strong>Bulk board:</strong> acciones masivas sobre ítems de upgrade / stale / digest
            (asignar, etc.).
          </li>
          <li>
            <strong>Upgrade / Stale / Follow-up / Outcome queues:</strong> colas específicas.
          </li>
        </ul>
        <h3>Paso a paso típico del día</h3>
        <ol className="sv-steps">
          <li>Abrí Priority (solo mías).</li>
          <li>Atendé follow-ups vencidos del Digest.</li>
          <li>Abrí 3–5 fichas, actualizá nota + follow-up o outcome.</li>
          <li>Si hay pagos trabados, resolvé Liberar / Reaplicar antes de hablar de upgrade.</li>
          <li>Al final, Ejecutar ciclo comercial si el cron no corrió.</li>
        </ol>
      </section>

      <section className="sv-section" id="sa-migracion">
        <h2>10. Import / Export ops</h2>
        <ol className="sv-steps">
          <li>
            En la <strong>home</strong>, card de cola de migración: jobs en cola, workers activos /
            con error (solo lectura operativa).
          </li>
          <li>
            En la <strong>ficha</strong> de la clínica, card Import / Export: lotes e imports de ese
            tenant (tenant-safe, sin mutar otro tenant).
          </li>
          <li>
            La clínica ejecuta import/export desde su Configuración; Superadmin monitorea y diagnostica.
          </li>
        </ol>
        <MockSuperadminMigration />
      </section>

      <section className="sv-section" id="sa-equipo">
        <h2>11. Qué NO se hace en Superadmin</h2>
        <p>
          Para “habilitarle algo a una persona” hacen falta tres capas:
        </p>
        <ol className="sv-steps">
          <li>
            La <strong>clínica</strong> tiene el módulo (plan, extra u override en Superadmin).
          </li>
          <li>
            La persona está en <strong>Configuración → Equipo</strong>, activa, con un rol.
          </li>
          <li>
            Ese rol incluye el permiso (matriz de <strong>Roles</strong> es de consulta; el rol se
            cambia en Equipo).
          </li>
        </ol>
        <p>
          Ejemplo: Lucía no ve Farmacia → 1) Activá Farmacia en Superadmin para esa clínica → 2) En
          Equipo, rol Veterinario → 3) Recargá. Receta/WhatsApp también piden el permiso del rol.
        </p>
        <MockEquipoRoles />
        <h3>Cómo se vuelve Superadmin</h3>
        <p>
          No es un rol de clínica. El email debe estar en <code>SUPERADMIN_EMAILS</code>. La tabla{' '}
          <code>platform_admins</code> autoriza los RPCs después del bootstrap. Equipo nunca otorga
          Superadmin.
        </p>
      </section>

      <section className="sv-section" id="sa-checklist">
        <h2>12. Checklists rápidos</h2>
        <h3>Habilitar WhatsApp a una clínica</h3>
        <ol className="sv-steps">
          <li>Abrí la ficha.</li>
          <li>Otorgá add-on WhatsApp <em>o</em> Activá feature WhatsApp <em>o</em> subí el plan.</li>
          <li>Pedile al owner que recargue y que el usuario tenga permiso <code>whatsapp:send</code>.</li>
        </ol>
        <h3>Clínica trabada en pago</h3>
        <ol className="sv-steps">
          <li>Home → Pagos en curso → Liberar.</li>
          <li>Si hay webhook pendiente → Reaplicar (o Omitir si el cobro no aplica).</li>
        </ol>
        <h3>Clínica sobre cupos</h3>
        <ol className="sv-steps">
          <li>Abrí ficha → Features → Límite del cupo correspondiente.</li>
          <li>O cambiá a un plan con más cupo.</li>
        </ol>
        <h3>Cerrar una oportunidad comercial</h3>
        <ol className="sv-steps">
          <li>Ficha → recomendación → Outcome (won/lost/deferred/not_a_fit).</li>
          <li>Si won y hay que subir plan → Suscripción → Cambiar plan (con motivo).</li>
        </ol>
      </section>
    </div>
  );
}
