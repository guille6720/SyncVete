import type { ReactNode } from 'react';
import {
  MockAgenda,
  MockBilling,
  MockDashboard,
  MockPatients,
  MockSoap,
} from '@/components/manual/manual-mocks';

const ILLUSTRATIONS = {
  cover: '/manual/illustrations/cover.jpg',
  agenda: '/manual/illustrations/agenda.jpg',
  consulta: '/manual/illustrations/consulta.jpg',
  pacientes: '/manual/illustrations/pacientes.jpg',
  caja: '/manual/illustrations/caja.jpg',
  config: '/manual/illustrations/config.jpg',
  logo: '/brand/logo.png',
} as const;

function Figure({ src, alt }: { src: string; alt: string }) {
  return (
    // El HTML descargable no puede usar next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={880} height={880} />
  );
}

export function UserManual({ toolbar }: { toolbar?: ReactNode }) {
  return (
    <div className="sv-manual">
      {toolbar}
      <header className="sv-cover">
        <Figure src={ILLUSTRATIONS.cover} alt="Equipo veterinario saludando a un perro y un gato en la clínica" />
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ILLUSTRATIONS.logo} alt="SyncVete" width={120} height={120} style={{ height: 56, width: 'auto', borderRadius: 8 }} />
          <span className="sv-kicker">Manual de uso</span>
          <h1>Todo el día de la clínica, en un solo lugar</h1>
          <p>
            Guía práctica para entrar, cargar pacientes, atender consultas, cobrar y configurar el plan.
            Los módulos que ves en el menú dependen del plan y de tu rol.
          </p>
        </div>
      </header>

      <nav className="sv-toc" aria-label="Índice">
        <a href="#inicio">1. Entrar y moverte</a>
        <a href="#dashboard">2. Dashboard</a>
        <a href="#agenda">3. Agenda</a>
        <a href="#pacientes">4. Propietarios y pacientes</a>
        <a href="#consultas">5. Consultas e historia</a>
        <a href="#clinica">6. Internación, vacunas y cirugías</a>
        <a href="#lab">7. Laboratorio e imágenes</a>
        <a href="#stock">8. Inventario y farmacia</a>
        <a href="#cobros">9. Facturación y caja</a>
        <a href="#ops">10. Reportes, avisos e IA</a>
        <a href="#config">11. Configuración y plan</a>
        <a href="#import-export">11b. Importar / Exportar</a>
        <a href="#roles">12. Roles y portal del tutor</a>
      </nav>

      <section className="sv-section" id="inicio">
        <h2>1. Entrar y moverte</h2>
        <p>
          En <strong>Iniciar sesión</strong> usá el email y la contraseña de la clínica. Si olvidaste la clave, entrá a
          Recuperar contraseña. El alta de una clínica nueva se hace desde Registrá tu clínica.
        </p>
        <h3>Barra superior</h3>
        <ul className="sv-steps">
          <li>
            <strong>Buscar</strong> (Ctrl+K o Cmd+K): saltás a cualquier módulo o acción rápida (nuevo paciente, nueva
            cita, receta, factura).
          </li>
          <li>
            <strong>Manual</strong>: descarga esta guía. Está al lado de la rueda de Configuración.
          </li>
          <li>
            <strong>Config</strong>: clínica, plan, sucursales, equipo y roles.
          </li>
          <li>
            <strong>Color / Oscuro</strong>: cambian el acento y el tema. Se guardan en este navegador.
          </li>
          <li>
            <strong>Campana</strong>: avisos de laboratorio, stock y recordatorios.
          </li>
          <li>
            Si hay más de una sucursal, el selector de la derecha cambia la sucursal activa.
          </li>
        </ul>
        <div className="sv-callout">
          El menú de la izquierda muestra solo los módulos incluidos en tu plan. Configuración siempre queda visible
          para que puedas contratar o renovar.
        </div>
      </section>

      <section className="sv-section" id="dashboard">
        <h2>2. Dashboard</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.cover} alt="Ilustración del equipo en la recepción de la clínica" />
          <p>
            Es el tablero del día: turnos, internados, stock bajo y actividad reciente. Sirve para arrancar el turno
            sin entrar módulo por módulo.
          </p>
        </div>
        <MockDashboard />
      </section>

      <section className="sv-section" id="agenda">
        <h2>3. Agenda</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.agenda} alt="Recepción con agenda semanal y un perro en sala de espera" />
          <div>
            <p>
              La agenda muestra la semana. Con <strong>Nueva cita</strong> elegís paciente, fecha, profesional y motivo.
              Desde la ficha del turno podés ver el detalle o editarlo.
            </p>
            <ul className="sv-steps">
              <li>Si el paciente no existe, cargalo antes (o crealo desde el buscador de la cita).</li>
              <li>Los estados del turno (pendiente, en consulta, completado, cancelado) se actualizan al atender.</li>
              <li>Los recordatorios pueden avisar al tutor según cómo esté configurada la clínica.</li>
            </ul>
          </div>
        </div>
        <MockAgenda />
      </section>

      <section className="sv-section" id="pacientes">
        <h2>4. Propietarios y pacientes</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.pacientes} alt="Ficha digital de mascotas con una gata y un perro" />
          <div>
            <p>
              Primero el <strong>propietario</strong> (tutor): nombre, contacto y datos de facturación. Después el{' '}
              <strong>paciente</strong>: especie, raza, sexo, fecha de nacimiento y vínculo con el tutor.
            </p>
            <ul className="sv-steps">
              <li>En la ficha de la mascota ves historia reciente, vacunas e internaciones.</li>
              <li>Un tutor puede tener varias mascotas; una mascota apunta a un tutor.</li>
              <li>Usá el buscador de la lista si la clínica ya tiene muchos pacientes.</li>
            </ul>
          </div>
        </div>
        <MockPatients />
      </section>

      <section className="sv-section" id="consultas">
        <h2>5. Consultas e historia clínica</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.consulta} alt="Veterinaria examinando un perro con nota clínica SOAP" />
          <div>
            <p>
              En <strong>Consultas</strong> está la cola del día. Iniciá la atención y completá la nota SOAP:
            </p>
            <ul className="sv-steps">
              <li>
                <strong>S — Subjetivo:</strong> lo que cuenta el tutor.
              </li>
              <li>
                <strong>O — Objetivo:</strong> examen, constantes, hallazgos.
              </li>
              <li>
                <strong>A — Evaluación:</strong> diagnóstico o impresión clínica.
              </li>
              <li>
                <strong>P — Plan:</strong> tratamiento, estudios y control.
              </li>
            </ul>
            <p>
              Podés guardar borrador y completar cuando termines. La evolución también puede cargarse en Historia
              clínica, independiente de una consulta de mostrador.
            </p>
          </div>
        </div>
        <MockSoap />
      </section>

      <section className="sv-section" id="clinica">
        <h2>6. Internación, vacunación y cirugías</h2>
        <div className="sv-grid-2">
          <div className="sv-card">
            <strong>Internación</strong>
            <span>
              Admití al paciente, registrá notas de evolución y dales el alta. El tablero muestra quién está internado
              ahora; el historial guarda las estadías cerradas.
            </span>
          </div>
          <div className="sv-card">
            <strong>Vacunación</strong>
            <span>
              Registrá la dosis, el producto y el próximo refuerzo. El tablero de vencimientos ayuda a convocar
              controles.
            </span>
          </div>
          <div className="sv-card">
            <strong>Cirugías</strong>
            <span>
              Programá el procedimiento, seguí el estado en el quirófano del día y cerrá la ficha cuando termine.
            </span>
          </div>
          <div className="sv-card">
            <strong>Orden de trabajo</strong>
            <span>
              Agenda → consulta o cirugía → historia. Si hay cobro, pasá a Facturación con los ítems de esa atención.
            </span>
          </div>
        </div>
      </section>

      <section className="sv-section" id="lab">
        <h2>7. Laboratorio e imágenes</h2>
        <p>
          En <strong>Laboratorio</strong> creás la orden, la ves en cola y cargás resultados. El tutor o el equipo
          reciben aviso cuando hay novedades, según notificaciones.
        </p>
        <p>
          En <strong>Imágenes</strong> subís fotos, radiografías o ecografías vinculadas al paciente. Quedan en la
          galería para la próxima consulta.
        </p>
      </section>

      <section className="sv-section" id="stock">
        <h2>8. Inventario y farmacia</h2>
        <p>
          <strong>Inventario</strong> es el stock de productos e insumos: alta, stock mínimo y alertas de faltante. El
          dashboard avisa cuando hay ítems por debajo del mínimo.
        </p>
        <p>
          <strong>Farmacia</strong> es la receta: medicamento, dosis e indicaciones. Podés despachar y dejar el
          registro en la ficha del paciente.
        </p>
      </section>

      <section className="sv-section" id="cobros">
        <h2>9. Facturación y caja</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.caja} alt="Mostrador de caja de la clínica con una gata junto a la tablet" />
          <div>
            <p>
              En <strong>Facturación</strong> armás la factura con ítems (consulta, vacunas, internación, productos).
              El tablero de abiertas muestra lo que falta cobrar; el historial, lo cerrado.
            </p>
            <p>
              En <strong>Caja</strong> abrís el turno con el efectivo inicial, registrás movimientos y cerrás al final
              del día. Los cobros de facturas impactan en esa sesión.
            </p>
          </div>
        </div>
        <MockBilling />
      </section>

      <section className="sv-section" id="ops">
        <h2>10. Reportes, avisos e IA</h2>
        <div className="sv-grid-2">
          <div className="sv-card">
            <strong>Reportes</strong>
            <span>Resumen operativo y de caja por período. Filtrá fechas para el cierre de mes.</span>
          </div>
          <div className="sv-card">
            <strong>Auditoría</strong>
            <span>Quién cambió qué y cuándo. Útil si hay varios usuarios en la misma clínica.</span>
          </div>
          <div className="sv-card">
            <strong>WhatsApp y recordatorios</strong>
            <span>
              Mensajes al tutor y avisos de turnos, vacunas o saldos. El envío de WhatsApp depende del plan y de los
              cupos.
            </span>
          </div>
          <div className="sv-card">
            <strong>IA clínica</strong>
            <span>
              Ayuda a resumir notas SOAP o redactar indicaciones. Consume cupo del plan: si te acercás al límite, el
              aviso aparece arriba.
            </span>
          </div>
        </div>
      </section>

      <section className="sv-section" id="config">
        <h2>11. Configuración y plan</h2>
        <div className="sv-split">
          <Figure src={ILLUSTRATIONS.config} alt="Persona configurando la clínica en una notebook" />
          <div>
            <p>La rueda <strong>Config</strong> abre las pestañas según tu permiso:</p>
            <ul className="sv-steps">
              <li>
                <strong>Clínica:</strong> nombre, datos y preferencias.
              </li>
              <li>
                <strong>Plan:</strong> Basic, Pro, Premium o Enterprise, extras y medios de pago. No inicies otro pago
                si hay uno en confirmación.
              </li>
              <li>
                <strong>Sucursales:</strong> altas y sucursal principal.
              </li>
              <li>
                <strong>Equipo:</strong> invitaciones y asientos del plan.
              </li>
              <li>
                <strong>Roles:</strong> qué puede hacer cada perfil.
              </li>
              <li>
                <strong>Importar / Exportar:</strong> migración de datos (owner/admin, según plan).
              </li>
            </ul>
            <div className="sv-callout">
              Si ves un aviso amarillo (trial por vencer, pago pendiente, cupo de asientos o de IA), abrí Plan. La
              clínica sigue operativa; el aviso indica qué hay que renovar o ampliar.
            </div>
          </div>
        </div>
      </section>

      <section className="sv-section" id="import-export">
        <h2>11b. Importar / Exportar datos</h2>
        <p>
          En <strong>Configuración → Importar / Exportar</strong> podés migrar propietarios, pacientes, historias,
          vacunas, laboratorio, cirugías, recetas, internaciones y adjuntos (ZIP SyncVete).
        </p>
        <ul className="sv-steps">
          <li>
            <strong>Orden recomendado:</strong> sucursales → propietarios → pacientes → historias → vacunas → especialidades →
            adjuntos.
          </li>
          <li>
            <strong>Sucursales:</strong> exportá e importá sucursales (CSV con `external_branch_id`, `code`, `name`).
            Van primero en la migración guiada. Nunca se promueve una sucursal importada a principal (`is_main` queda en
            false); activá/desactivá con `is_active`.
          </li>
          <li>
            <strong>Dry-run:</strong> validá antes de confirmar. Descargá el reporte CSV si hay avisos o errores.
          </li>
          <li>
            <strong>Conflictos:</strong> no se pisan datos en silencio: elegí crear, vincular, omitir o revisar.
          </li>
          <li>
            <strong>Idempotencia:</strong> podés omitir filas que ya existan por <em>source_record_id</em>.
          </li>
          <li>
            <strong>Cola:</strong> lotes grandes se encolan; cancelá o reintentá desde el historial. Una sola
            importación activa por clínica.
          </li>
          <li>
            <strong>Avisos:</strong> al terminar (o fallar) import/export recibís una notificación in-app
            con enlace a esta pantalla.
          </li>
          <li>
            <strong>Límites:</strong> CSV hasta 25 MB; ZIP de adjuntos hasta 80 MB.
          </li>
          <li>
            <strong>Adjuntos (fase 42):</strong> podés incluir un <code>attachments_meta.csv</code> opcional en la raíz
            del ZIP o bajo <code>data/</code> para asignar sucursal y staff por archivo (`external_patient_id` +
            <code>filename</code>); sin fila de metadata se usan los valores por defecto del importador.
          </li>
          <li>
            <strong>ZIP de ejemplo:</strong> incluye plantillas de mapa staff/sucursal y notas round-trip para
            probar migración completa. En la migración guiada, cada paso muestra si admite mapa de sucursal o
            staff y si ya tenés uno cargado.
          </li>
          <li>
            <strong>Integridad:</strong> el historial muestra huérfanos de id-map / filas creadas y locks
            trabados; podés descargar el reporte CSV y el id-map de cada lote. También liberar locks
            stale y podar mapas huérfanos (simulá primero).
          </li>
          <li>
            <strong>Multi-sede:</strong> en propietarios, pacientes, historias clínicas, vacunas, laboratorio,
            cirugías, recetas, internaciones, agenda, consultas, inventario y facturas podés usar la columna
            opcional `external_branch_id` para asignar cada fila a una sucursal. Importá sucursales antes; cargá el
            mapa sucursales (CSV external_branch_id → internal_branch_id) o usá UUID internos del tenant en
            re-import (round-trip). Si el ID no está mapeado ni es un branch conocido, la fila falla (no se usa la
            sucursal por defecto en silencio).
          </li>
          <li>
            <strong>Historias clínicas y vacunas:</strong> además de multi-sede con `external_branch_id`,
            podés asignar profesional con `external_assigned_user_id` (mismo mapa staff que consultas; vacío =
            usuario importador).
          </li>
          <li>
            <strong>Agenda:</strong> exportá e importá citas (CSV con `starts_at`/`ends_at`). Podés asignar
            profesional con `external_assigned_user_id`: requiere el mapa staff (CSV
            external_staff_id → internal_user_id) o un profile id existente del tenant. Exportá{' '}
            <code>staff_profiles</code> primero para armar el mapa. En la migración guiada van después de
            internaciones y antes de consultas. El dry-run avisa solapamientos del mismo paciente en el archivo.
            En citas, si dejás vacío `external_assigned_user_id`, la cita queda sin profesional asignado.
          </li>
          <li>
            <strong>Consultas:</strong> exportá e importá consultas SOAP (CSV con `started_at`/`completed_at`).
            Podés vincular `external_appointment_id` si importaste citas antes. También podés asignar profesional
            con `external_assigned_user_id` (mismo mapa staff que agenda; vacío = usuario importador). En la
            migración guiada van después de agenda y antes de inventario.
          </li>
          <li>
            <strong>Checklist go-live:</strong> en el historial de importación podés correr un
            checklist (propietarios, pacientes, citas 30d, vacunas, inventario, locks/huérfanos) y
            descargarlo en CSV.
          </li>
          <li>
            <strong>Id-map org:</strong> descargá el mapa external_id → internal_id de toda la clínica
            (CSV con meta de organización). También se incluye en el paquete cutover como{' '}
            <code>id_map.csv</code>.
          </li>
          <li>
            <strong>Paquete cutover:</strong> antes del go-live descargá el ZIP de cutover (integridad,
            checklist, conciliación de facturación, export_catalog.csv, freeze_recommendations.csv e
            id_map.csv). Es solo lectura: no modifica datos, planes ni caja.
          </li>
          <li>
            <strong>Inventario:</strong> exportá e importá productos (CSV con SKU/categoría/stock). En
            la migración guiada van antes de adjuntos. También podés exportar{' '}
            <code>inventory_movements</code> (movimientos de stock, auditoría). No se importa — el stock se
            deriva de operaciones reales, no de migración.
          </li>
          <li>
            <strong>Internaciones (fase 44–45):</strong> el ZIP completo (`full_clinic`) y el export JSON
            incluyen las notas de evolución (<code>hospitalization_notes</code>: tipo, contenido, peso,
            temperatura, quién la registró). El CSV/XLSX individual de internaciones aplana las notas en
            filas (como lab/recetas con ítems); el ZIP specialty también trae las notas. Solo lectura — no se
            importan; se registran en la app durante la estadía, no por migración.
          </li>
          <li>
            <strong>ZIP specialty (fase 47):</strong> al exportar solo laboratorio o recetas en formato ZIP
            también se incluyen los ítems hijos (<code>lab_order_items</code> /
            <code>prescription_items</code>). Cirugías specialty incluye el CSV padre además del JSON.
          </li>
          <li>
            <strong>ZIP enfocado (fase 48):</strong> si exportás una sola entidad en ZIP (p. ej. caja,
            facturas, staff, movimientos de stock), el archivo solo trae esa entidad y sus companions
            (movimientos de caja, ítems/pagos de factura, membresías). El volcado completo queda para
            <code>full_clinic</code> / historia de un paciente.
          </li>
          <li>
            <strong>JSON enfocado (fase 49, formato 1.6):</strong> igual que el ZIP: un export JSON de
            una sola entidad o specialty incluye solo <code>manifest</code>, la entidad y sus hijos
            (ítems lab/recetas, notas de internación, movimientos de caja, etc.).
          </li>
          <li>
            <strong>Adjuntos round-trip (fase 50):</strong> al exportar <code>full_clinic</code> /
            historia de un paciente en ZIP, se genera <code>attachments_meta.csv</code> con
            paciente/archivo/sucursal/uploader de cada binario empaquetado — listo para re-import
            (fase 42). El ZIP de ejemplo y el cutover pack v4 incluyen la plantilla.
          </li>
          <li>
            <strong>Adjuntos clínicos — metadata (fase 46):</strong> exportá el catálogo de
            <code>clinical_images</code> (paciente, tipo, nombre, mime, tamaño, ruta, sucursal/uploader).
            Solo lectura: no recrea filas. Los binarios se exportan/importan aparte vía ZIP de adjuntos
            (con <code>attachments_meta.csv</code> opcional).
          </li>
          <li>
            <strong>Facturas:</strong> exportá e importá facturas con ítems. Podés asignar quién creó la
            factura con `external_assigned_user_id` (mismo mapa staff; vacío = usuario importador). Los pagos
            se importan aparte (histórico, sin caja) y también se pueden exportar solos. Podés asignar quién
            registró el pago con `external_assigned_user_id` (mismo mapa staff; vacío = usuario importador). Los
            exports CSV/ZIP incluyen `external_branch_id` y `external_assigned_user_id` con UUID internos
            para round-trip. El paquete cutover v3 incluye plantillas staff/branch y notas round-trip; el mapa
            sucursales se puede cargar en la pantalla de importación. Usá la conciliación de facturación para
            comparar `paid_amount` vs suma de pagos antes del go-live.
          </li>
          <li>
            <strong>Caja:</strong> exportá sesiones de caja históricas con sus movimientos. No se
            importa caja (no reabre sesiones ni crea movimientos).
          </li>
          <li>
            <strong>Recordatorios:</strong> exportá el historial de <code>reminder_logs</code> (envíos
            y estados). No se importa — evita reenviar notificaciones o WhatsApp.
          </li>
          <li>
            <strong>WhatsApp:</strong> exportá el historial de <code>whatsapp_messages</code> (mensajes
            enviados). No se importa — evita reenviar mensajes o recrear efectos secundarios.
          </li>
          <li>
            <strong>Auditoría:</strong> exportá el historial de <code>audit_logs</code> (acciones y
            cambios). No se importa — no reescribe la pista de auditoría.
          </li>
          <li>
            <strong>Notificaciones:</strong> exportá el historial de <code>notifications</code> (alertas
            in-app). No se importa — no recrea el inbox ni marca lecturas.
          </li>
          <li>
            <strong>Staff:</strong> exportá <code>staff_profiles</code> (perfiles + membresías por
            sucursal). No se importa — no crea usuarios en auth ni asigna roles. Usá el export para armar el
            mapa staff al importar citas, consultas, historias, vacunas, laboratorio, recetas, cirugías e
            internaciones con <code>external_assigned_user_id</code>.
          </li>
          <li>
            <strong>Rollback:</strong> solo revierte filas creadas por ese lote (no toca datos previos).
          </li>
        </ul>
        <div className="sv-callout">
          Exportá CSV/JSON/XLSX/ZIP/PDF con rango de fechas. Las recetas y el laboratorio incluyen ítems. Los
          artefactos vencen y se limpian automáticamente.
        </div>
      </section>

      <section className="sv-section" id="roles">
        <h2>12. Roles y portal del tutor</h2>
        <table className="sv-roles">
          <thead>
            <tr>
              <th>Rol</th>
              <th>Para qué está</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Propietario / Administrador</td>
              <td>Clínica, plan, sucursales, equipo y operación completa.</td>
            </tr>
            <tr>
              <td>Veterinario</td>
              <td>Pacientes, agenda, clínica, recetas e IA. Sin administrar el plan.</td>
            </tr>
            <tr>
              <td>Enfermero/a</td>
              <td>Pacientes, internación, vacunas y apoyo clínico.</td>
            </tr>
            <tr>
              <td>Recepcionista</td>
              <td>Agenda, altas de tutores y mostrador.</td>
            </tr>
            <tr>
              <td>Cajero/a</td>
              <td>Facturas y caja del día.</td>
            </tr>
            <tr>
              <td>Técnico de laboratorio</td>
              <td>Órdenes y resultados de laboratorio.</td>
            </tr>
            <tr>
              <td>Solo lectura</td>
              <td>Consulta sin editar.</td>
            </tr>
          </tbody>
        </table>
        <h3>Portal del tutor</h3>
        <p>
          El tutor entra por el portal (no por el login de la clínica). La clínica envía una invitación; el tutor
          activa la cuenta en <strong>Activar portal</strong> y ve sus mascotas. El personal de la clínica no usa esa
          entrada para trabajar.
        </p>
      </section>

      <footer className="sv-footer">
        SyncVete · Manual de uso · Agosto 2026. Si un módulo no aparece en el menú, revisá el plan o pedile a un
        administrador que te asigne el rol adecuado.
      </footer>
    </div>
  );
}

