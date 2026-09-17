import type { ReactNode } from 'react';

function Frame({
  title,
  children,
  height = 430,
}: {
  title: string;
  children: ReactNode;
  height?: number;
}) {
  return (
    <figure className="sv-figure">
      <svg
        className="w-full max-w-3xl rounded-xl border bg-muted/30 shadow-sm"
        viewBox={`0 0 840 ${height}`}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <rect width="840" height={height} rx="14" fill="#0f172a" />
        <rect x="12" y="12" width="816" height="44" rx="10" fill="#1e293b" />
        <text
          x="28"
          y="40"
          fill="#99f6e4"
          fontSize="14"
          fontFamily="Segoe UI, sans-serif"
          fontWeight="700"
        >
          SyncVete · Superadmin
        </text>
        <text x="250" y="40" fill="#e2e8f0" fontSize="13" fontFamily="Segoe UI, sans-serif">
          {title.split('·')[0]?.trim() || 'Panel'}
        </text>
        <text x="680" y="40" fill="#94a3b8" fontSize="12" fontFamily="Segoe UI, sans-serif">
          Volver a la clínica
        </text>
        <rect x="12" y="68" width="816" height={height - 80} rx="12" fill="#f8fafc" />
        {children}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

export function MockSuperadminHome() {
  return (
    <Frame title="Home · Organizaciones y KPIs">
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Organizaciones
      </text>
      {[
        ['48', 'Clínicas', 32],
        ['6', 'Trial', 168],
        ['31', 'Activas', 304],
        ['4', 'Pago pend.', 440],
        ['3', 'Sobre cupos', 576],
        ['2', 'Webhooks', 712],
      ].map(([n, label, x]) => (
        <g key={label}>
          <rect x={Number(x)} y="112" width="120" height="58" rx="10" fill="#ecfdf5" />
          <text
            x={Number(x) + 12}
            y="138"
            fill="#0d9488"
            fontSize="18"
            fontFamily="Segoe UI, sans-serif"
            fontWeight="700"
          >
            {n}
          </text>
          <text
            x={Number(x) + 12}
            y="156"
            fill="#64748b"
            fontSize="10"
            fontFamily="Segoe UI, sans-serif"
          >
            {label}
          </text>
        </g>
      ))}
      <rect x="32" y="188" width="200" height="30" rx="8" fill="#0d9488" />
      <text x="48" y="208" fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Ejecutar ciclo comercial
      </text>
      <rect x="248" y="188" width="210" height="30" rx="8" fill="#fff" stroke="#0d9488" />
      <text x="268" y="208" fill="#0f766e" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Actualizar recomendaciones
      </text>
      <rect x="32" y="236" width="220" height="28" rx="8" fill="#fff" stroke="#cbd5e1" />
      <text x="44" y="255" fill="#94a3b8" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Buscar por nombre o slug
      </text>
      <rect x="32" y="278" width="776" height="130" rx="10" fill="#fff" stroke="#e2e8f0" />
      {['Clínica BMW    Pro     activa   · sugerido Premium', 'San Roque      Trial   trialing · follow-up hoy', 'Huella Norte   Basic   past_due · sobre cupos'].map(
        (row, i) => (
          <text
            key={row}
            x="48"
            y={312 + i * 32}
            fill="#334155"
            fontSize="13"
            fontFamily="Segoe UI, sans-serif"
          >
            {row}
          </text>
        )
      )}
    </Frame>
  );
}

export function MockSuperadminFeatures() {
  return (
    <Frame title="Ficha · Features y overrides">
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Clínica BMW · Features
      </text>
      <text x="32" y="118" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Resolución: override → extra → plan → default. Activar crea un override.
      </text>
      {[
        ['WhatsApp', 'sí', 'plan', 140],
        ['IA clínica', 'no', 'deny', 188],
        ['Imágenes', 'sí', 'override', 236],
        ['Máx. usuarios', '8 / 10', 'plan', 284],
      ].map(([feat, on, src, y]) => (
        <g key={feat}>
          <rect x="32" y={Number(y)} width="776" height="40" rx="8" fill="#fff" stroke="#e2e8f0" />
          <text x="48" y={Number(y) + 26} fill="#0f172a" fontSize="13" fontFamily="Segoe UI, sans-serif">
            {feat}
          </text>
          <text x="280" y={Number(y) + 26} fill="#0d9488" fontSize="12" fontFamily="Segoe UI, sans-serif">
            On: {on}
          </text>
          <text x="430" y={Number(y) + 26} fill="#64748b" fontSize="12" fontFamily="Segoe UI, sans-serif">
            Fuente: {src}
          </text>
          <rect x="620" y={Number(y) + 8} width="72" height="24" rx="6" fill="#0d9488" />
          <text x="632" y={Number(y) + 25} fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Activar
          </text>
          <rect x="700" y={Number(y) + 8} width="88" height="24" rx="6" fill="#fff" stroke="#94a3b8" />
          <text x="714" y={Number(y) + 25} fill="#334155" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Límite
          </text>
        </g>
      ))}
    </Frame>
  );
}

export function MockSuperadminSubscription() {
  return (
    <Frame title="Ficha · Suscripción, trial y plan" height={460}>
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Suscripción
      </text>
      <rect x="32" y="112" width="64" height="24" rx="6" fill="#ccfbf1" />
      <text x="42" y="129" fill="#0f766e" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Pro
      </text>
      <rect x="104" y="112" width="64" height="24" rx="6" fill="#dcfce7" />
      <text x="116" y="129" fill="#166534" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        active
      </text>
      <text x="32" y="168" fill="#0f172a" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Cambiar plan
      </text>
      <rect x="32" y="178" width="280" height="32" rx="8" fill="#fff" stroke="#cbd5e1" />
      <text x="44" y="199" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Premium
      </text>
      <rect x="328" y="178" width="280" height="32" rx="8" fill="#fff" stroke="#cbd5e1" />
      <text x="340" y="199" fill="#94a3b8" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Motivo del cambio
      </text>
      <text x="32" y="236" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        ☐ Confirmo asignar legacy · ☐ Asignar igual si supera cupos
      </text>
      <rect x="32" y="252" width="140" height="30" rx="8" fill="#0d9488" />
      <text x="58" y="272" fill="#fff" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Guardar plan
      </text>
      <rect x="32" y="300" width="360" height="120" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="328" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Iniciar trial
      </text>
      <text x="48" y="356" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Días (vacío = abierto) · Motivo
      </text>
      <rect x="48" y="370" width="120" height="28" rx="8" fill="#fff" stroke="#94a3b8" />
      <text x="68" y="389" fill="#334155" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Iniciar trial
      </text>
      <rect x="420" y="300" width="360" height="120" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="436" y="328" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Terminar trial
      </text>
      <text x="436" y="356" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Elegí plan comercial · Motivo
      </text>
      <rect x="436" y="370" width="140" height="28" rx="8" fill="#fff" stroke="#94a3b8" />
      <text x="456" y="389" fill="#334155" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Terminar trial
      </text>
    </Frame>
  );
}

export function MockSuperadminAddons() {
  return (
    <Frame title="Ficha · Add-ons (extras)">
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Add-ons
      </text>
      <text x="32" y="118" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Extras sobre el plan. Superadmin los otorga sin checkout.
      </text>
      {[
        ['WhatsApp', 'activo · sin vencimiento', 140],
        ['IA clínica', 'activo · hasta 15/10/2026', 198],
      ].map(([name, meta, y]) => (
        <g key={name}>
          <rect x="32" y={Number(y)} width="776" height="48" rx="8" fill="#fff" stroke="#e2e8f0" />
          <text x="48" y={Number(y) + 20} fill="#0f172a" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
            {name}
          </text>
          <text x="48" y={Number(y) + 38} fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
            {meta}
          </text>
          <rect x="680" y={Number(y) + 12} width="100" height="24" rx="6" fill="#fff" stroke="#ef4444" />
          <text x="708" y={Number(y) + 29} fill="#b91c1c" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Quitar
          </text>
        </g>
      ))}
      <rect x="32" y="270" width="776" height="110" rx="10" fill="#ecfdf5" stroke="#99f6e4" />
      <text x="48" y="298" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Otorgar add-on
      </text>
      <text x="48" y="324" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Extra: Portal del tutor · Vence: opcional · Motivo: piloto 30 días
      </text>
      <rect x="48" y="340" width="140" height="28" rx="8" fill="#0d9488" />
      <text x="72" y="359" fill="#fff" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Otorgar add-on
      </text>
    </Frame>
  );
}

export function MockSuperadminBillingQueues() {
  return (
    <Frame title="Home · Colas de pagos y webhooks" height={460}>
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Colas comerciales
      </text>
      <rect x="32" y="120" width="380" height="150" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="148" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Pagos en curso
      </text>
      <text x="48" y="176" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Clínica BMW · checkout abierto
      </text>
      <rect x="48" y="196" width="90" height="26" rx="6" fill="#0d9488" />
      <text x="68" y="214" fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Liberar
      </text>
      <rect x="436" y="120" width="380" height="150" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="452" y="148" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Webhooks pendientes
      </text>
      <text x="452" y="176" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        payment.succeeded · San Roque
      </text>
      <rect x="452" y="196" width="90" height="26" rx="6" fill="#0d9488" />
      <text x="468" y="214" fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Reaplicar
      </text>
      <rect x="552" y="196" width="80" height="26" rx="6" fill="#fff" stroke="#94a3b8" />
      <text x="572" y="214" fill="#334155" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Omitir
      </text>
      <rect x="32" y="290" width="776" height="130" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="320" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Planes / extras por vencer · Sobre cupos
      </text>
      <text x="48" y="348" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Huella Norte · Basic · usuarios 12/10 · abrir ficha → Features → Límite
      </text>
      <text x="48" y="376" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        La cola Sobre cupos es de lectura. El cupo se sube en la ficha de la clínica.
      </text>
    </Frame>
  );
}

export function MockSuperadminRecommendations() {
  return (
    <Frame title="Home · Cola de prioridad y recomendaciones" height={470}>
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Prioridad comercial
      </text>
      <text x="32" y="118" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Las recomendaciones no cambian el plan solas. Son trabajo comercial.
      </text>
      <rect x="32" y="136" width="776" height="44" rx="8" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="164" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        ☐ Solo mías · ☐ Incluir congeladas · ☐ Incluir snooze
      </text>
      {[
        ['Clínica BMW', 'Pro → Premium', 'Alta · follow-up vencido', 196],
        ['San Roque', 'Trial → Basic', 'Media · sin contacto', 252],
        ['Huella Norte', 'Basic → Pro', 'Alta · sobre cupos', 308],
      ].map(([name, plan, meta, y]) => (
        <g key={name}>
          <rect x="32" y={Number(y)} width="776" height="48" rx="8" fill="#fff" stroke="#e2e8f0" />
          <text x="48" y={Number(y) + 20} fill="#0f172a" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
            {name}
          </text>
          <text x="48" y={Number(y) + 38} fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
            {plan} · {meta}
          </text>
          <rect x="620" y={Number(y) + 12} width="70" height="24" rx="6" fill="#0d9488" />
          <text x="636" y={Number(y) + 29} fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Abrir
          </text>
          <rect x="700" y={Number(y) + 12} width="88" height="24" rx="6" fill="#fff" stroke="#94a3b8" />
          <text x="714" y={Number(y) + 29} fill="#334155" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Asignar
          </text>
        </g>
      ))}
      <text x="32" y="390" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        También: Funnel · Trends · Aging · Digest · Pipeline · Tags · Notas · Bulk
      </text>
    </Frame>
  );
}

export function MockSuperadminOrgRecommendation() {
  return (
    <Frame title="Ficha · Panel de recomendación" height={450}>
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Recomendación de plan
      </text>
      <rect x="32" y="116" width="776" height="70" rx="10" fill="#ecfdf5" stroke="#99f6e4" />
      <text x="48" y="144" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Sugerido: Premium · Severidad alta
      </text>
      <text x="48" y="168" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Motivos: usuarios cerca del tope · add-on WhatsApp activo · pago recurrente
      </text>
      <text x="32" y="220" fill="#0f172a" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Acciones comerciales
      </text>
      {[
        ['Asignar a', 240],
        ['Follow-up', 288],
        ['Outcome', 336],
        ['Tags / nota', 384],
      ].map(([label, y]) => (
        <g key={label}>
          <rect x="32" y={Number(y)} width="776" height="40" rx="8" fill="#fff" stroke="#e2e8f0" />
          <text x="48" y={Number(y) + 26} fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
            {label}
          </text>
          <rect x="680" y={Number(y) + 8} width="100" height="24" rx="6" fill="#0d9488" />
          <text x="704" y={Number(y) + 25} fill="#fff" fontSize="11" fontFamily="Segoe UI, sans-serif">
            Guardar
          </text>
        </g>
      ))}
    </Frame>
  );
}

export function MockSuperadminMigration() {
  return (
    <Frame title="Home / Ficha · Import-Export ops">
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Cola de migración (ops)
      </text>
      <text x="32" y="118" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Vista operativa. No muta datos de otro tenant desde acá.
      </text>
      <rect x="32" y="140" width="240" height="70" rx="10" fill="#ecfdf5" />
      <text x="48" y="168" fill="#0d9488" fontSize="20" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        3
      </text>
      <text x="48" y="190" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Jobs en cola
      </text>
      <rect x="288" y="140" width="240" height="70" rx="10" fill="#fff7ed" />
      <text x="304" y="168" fill="#c2410c" fontSize="20" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        1
      </text>
      <text x="304" y="190" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Workers con error
      </text>
      <rect x="544" y="140" width="264" height="70" rx="10" fill="#eff6ff" />
      <text x="560" y="168" fill="#1d4ed8" fontSize="20" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        2
      </text>
      <text x="560" y="190" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Workers activos
      </text>
      <rect x="32" y="230" width="776" height="160" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="258" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Últimos lotes (por clínica en la ficha)
      </text>
      <text x="48" y="290" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        import owners · completed · 120 ok · 2 fail
      </text>
      <text x="48" y="318" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        export patients · running · job #8841
      </text>
      <text x="48" y="346" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Detalle tenant-safe en la ficha → Import / Export
      </text>
    </Frame>
  );
}

export function MockEquipoRoles() {
  return (
    <Frame title="Clínica · Equipo y Roles (fuera de Superadmin)">
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Configuración · Equipo
      </text>
      <text x="32" y="118" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Los permisos de una persona se editan acá. Superadmin habilita el módulo a la clínica.
      </text>
      <rect x="32" y="136" width="380" height="250" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="48" y="162" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Invitar / rol
      </text>
      {['Lucía Pérez  · Veterinario  · Activo', 'Marco Díaz  · Recepcionista · Activo', 'Ana Gómez   · Solo lectura  · Activo'].map(
        (row, i) => (
          <text
            key={row}
            x="48"
            y={198 + i * 36}
            fill="#334155"
            fontSize="13"
            fontFamily="Segoe UI, sans-serif"
          >
            {row}
          </text>
        )
      )}
      <rect x="48" y="318" width="140" height="28" rx="8" fill="#0d9488" />
      <text x="72" y="337" fill="#fff" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Guardar rol
      </text>
      <rect x="428" y="136" width="380" height="250" rx="10" fill="#fff" stroke="#e2e8f0" />
      <text x="444" y="162" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Roles (solo lectura)
      </text>
      <text x="444" y="198" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Veterinario: pacientes, clínica, recetas
      </text>
      <text x="444" y="226" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Recepcionista: agenda y altas
      </text>
      <text x="444" y="254" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Cajero/a: facturas y caja
      </text>
      <text x="444" y="294" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        La matriz no se edita. Cambiá el rol en Equipo.
      </text>
    </Frame>
  );
}

export function MockSuperadminAccess() {
  return (
    <Frame title="Acceso · Cómo entrar a Superadmin" height={360}>
      <text x="32" y="98" fill="#0f172a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Menú · escudo Superadmin
      </text>
      <rect x="32" y="120" width="200" height="200" rx="12" fill="#0f172a" />
      <text x="48" y="150" fill="#99f6e4" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        SyncVete
      </text>
      {['Dashboard', 'Agenda', 'Pacientes', 'Superadmin ←', 'Configuración'].map((item, i) => (
        <text
          key={item}
          x="48"
          y={182 + i * 26}
          fill={item.includes('Superadmin') ? '#5eead4' : '#94a3b8'}
          fontSize="12"
          fontFamily="Segoe UI, sans-serif"
          fontWeight={item.includes('Superadmin') ? '700' : '400'}
        >
          {item}
        </text>
      ))}
      <text x="260" y="160" fill="#0f172a" fontSize="14" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Requisitos
      </text>
      <text x="260" y="192" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        1. Email en SUPERADMIN_EMAILS (Vercel)
      </text>
      <text x="260" y="220" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        2. Bootstrap en platform_admins (al entrar)
      </text>
      <text x="260" y="248" fill="#334155" fontSize="12" fontFamily="Segoe UI, sans-serif">
        3. SUPABASE_SERVICE_ROLE_KEY configurada
      </text>
      <text x="260" y="286" fill="#64748b" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Equipo de la clínica nunca otorga Superadmin.
      </text>
    </Frame>
  );
}
