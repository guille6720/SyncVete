import type { ReactNode } from 'react';

function Chrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <svg className="sv-mock" viewBox="0 0 840 470" role="img" aria-label={title}>
      <title>{title}</title>
      <rect width="840" height="470" rx="18" fill="#ecfdf5" />
      <rect x="12" y="12" width="196" height="446" rx="14" fill="#ffffff" />
      <rect x="28" y="28" width="44" height="44" rx="10" fill="#0d9488" />
      <path d="M42 50c6-8 16-8 22 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="44" r="4" fill="#99f6e4" />
      <text x="80" y="48" fill="#0f766e" fontSize="15" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        SyncVete
      </text>
      <text x="80" y="64" fill="#5eead4" fontSize="8" fontFamily="Segoe UI, sans-serif" letterSpacing="1.2">
        GESTIÓN VETERINARIA
      </text>
      {[
        ['Dashboard', 92],
        ['Agenda', 128],
        ['Pacientes', 164],
        ['Consultas', 200],
        ['Facturación', 236],
        ['Configuración', 272],
      ].map(([label, y]) => (
        <g key={label}>
          <rect
            x="28"
            y={Number(y) - 16}
            width="164"
            height="30"
            rx="8"
            fill={label === title.split(' · ')[0] ? '#0d9488' : 'transparent'}
          />
          <text
            x="44"
            y={Number(y) + 4}
            fill={label === title.split(' · ')[0] ? '#fff' : '#134e4a'}
            fontSize="12"
            fontFamily="Segoe UI, sans-serif"
          >
            {label}
          </text>
        </g>
      ))}
      <rect x="220" y="12" width="608" height="52" rx="12" fill="#ffffff" />
      <rect x="236" y="24" width="160" height="28" rx="8" fill="#f0fdfa" stroke="#99f6e4" />
      <text x="248" y="43" fill="#5b6b6a" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Buscar...  ⌘K
      </text>
      <rect x="520" y="24" width="78" height="28" rx="8" fill="#fff" stroke="#99f6e4" />
      <text x="534" y="43" fill="#0f766e" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Manual
      </text>
      <rect x="606" y="24" width="72" height="28" rx="8" fill="#fff" stroke="#99f6e4" />
      <text x="618" y="43" fill="#0f766e" fontSize="11" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Config
      </text>
      <circle cx="708" cy="38" r="12" fill="#ccfbf1" />
      <text x="703" y="43" fill="#0f766e" fontSize="11">
        ⚙
      </text>
      <circle cx="740" cy="38" r="12" fill="#ccfbf1" />
      <text x="734" y="43" fill="#0f766e" fontSize="12">
        🔔
      </text>
      <rect x="220" y="76" width="608" height="382" rx="14" fill="#ffffff" />
      {children}
    </svg>
  );
}

export function MockDashboard() {
  return (
    <Chrome title="Dashboard · resumen del día">
      <text x="244" y="108" fill="#134e4a" fontSize="20" fontFamily="Georgia, serif" fontWeight="700">
        Buenos días, Lucía
      </text>
      <text x="244" y="128" fill="#5b6b6a" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Rol: Veterinaria · Sucursal Centro
      </text>
      {[
        ['8', 'Turnos hoy', 244],
        ['3', 'Internados', 394],
        ['2', 'Stock bajo', 544],
        ['5', 'Por cobrar', 694],
      ].map(([n, label, x]) => (
        <g key={label}>
          <rect x={Number(x)} y="150" width="138" height="78" rx="12" fill="#f0fdfa" />
          <text x={Number(x) + 16} y="186" fill="#0d9488" fontSize="26" fontFamily="Segoe UI, sans-serif" fontWeight="700">
            {n}
          </text>
          <text x={Number(x) + 16} y="208" fill="#5b6b6a" fontSize="11" fontFamily="Segoe UI, sans-serif">
            {label}
          </text>
        </g>
      ))}
      <rect x="244" y="246" width="560" height="190" rx="12" fill="#f8fffd" stroke="#ccfbf1" />
      <text x="260" y="274" fill="#0f766e" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Próximos turnos
      </text>
      {['09:00  Luna · Control anual', '09:30  Misha · Vacuna', '10:15  Rocky · Cojera', '11:00  Coco · Cirugía prequirúrgico'].map(
        (row, i) => (
          <text key={row} x="260" y={304 + i * 28} fill="#334155" fontSize="13" fontFamily="Segoe UI, sans-serif">
            {row}
          </text>
        )
      )}
    </Chrome>
  );
}

export function MockAgenda() {
  return (
    <Chrome title="Agenda · día / semana / mes">
      <text x="244" y="108" fill="#134e4a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Agenda del día
      </text>
      <rect x="244" y="88" width="52" height="22" rx="6" fill="#0d9488" />
      <text x="254" y="103" fill="#fff" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Día
      </text>
      <rect x="302" y="88" width="64" height="22" rx="6" fill="#ccfbf1" />
      <text x="310" y="103" fill="#0f766e" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Semana
      </text>
      <rect x="372" y="88" width="52" height="22" rx="6" fill="#ccfbf1" />
      <text x="380" y="103" fill="#0f766e" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Mes
      </text>
      <rect x="700" y="88" width="108" height="28" rx="8" fill="#0d9488" />
      <text x="716" y="107" fill="#fff" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        + Nueva cita
      </text>
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d, i) => (
        <g key={d}>
          <rect x={244 + i * 114} y="130" width="106" height="300" rx="10" fill="#f8fffd" stroke="#ccfbf1" />
          <text x={256 + i * 114} y="154" fill="#0f766e" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
            {d}
          </text>
        </g>
      ))}
      <rect x="252" y="170" width="90" height="44" rx="8" fill="#99f6e4" />
      <text x="260" y="188" fill="#134e4a" fontSize="10" fontFamily="Segoe UI, sans-serif">
        09:00 Luna
      </text>
      <text x="260" y="202" fill="#0f766e" fontSize="9" fontFamily="Segoe UI, sans-serif">
        Confirmada
      </text>
      <rect x="366" y="220" width="90" height="44" rx="8" fill="#5eead4" />
      <text x="374" y="238" fill="#134e4a" fontSize="10" fontFamily="Segoe UI, sans-serif">
        10:30 Misha
      </text>
      <text x="374" y="252" fill="#0f766e" fontSize="9" fontFamily="Segoe UI, sans-serif">
        En sala
      </text>
      <rect x="594" y="186" width="90" height="52" rx="8" fill="#0d9488" />
      <text x="602" y="206" fill="#fff" fontSize="10" fontFamily="Segoe UI, sans-serif">
        09:30 Rocky
      </text>
      <text x="602" y="220" fill="#ccfbf1" fontSize="9" fontFamily="Segoe UI, sans-serif">
        En consulta
      </text>
    </Chrome>
  );
}

export function MockSoap() {
  return (
    <Chrome title="Consultas · nota SOAP">
      <text x="244" y="108" fill="#134e4a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Consulta · Luna
      </text>
      <text x="244" y="126" fill="#5b6b6a" fontSize="11" fontFamily="Segoe UI, sans-serif">
        Canino · 7 años · Tutor: Ana Pérez
      </text>
      {['S  Subjetivo', 'O  Objetivo', 'A  Evaluación', 'P  Plan'].map((label, i) => (
        <g key={label}>
          <rect x="244" y={144 + i * 72} width="560" height="64" rx="10" fill="#f8fffd" stroke="#ccfbf1" />
          <text x="260" y={166 + i * 72} fill="#0f766e" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
            {label}
          </text>
          <rect x="260" y={174 + i * 72} width="520" height="22" rx="6" fill="#ffffff" />
        </g>
      ))}
    </Chrome>
  );
}

export function MockPatients() {
  return (
    <Chrome title="Pacientes · ficha">
      <text x="244" y="108" fill="#134e4a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Pacientes
      </text>
      <rect x="700" y="88" width="108" height="28" rx="8" fill="#0d9488" />
      <text x="714" y="107" fill="#fff" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        + Nuevo
      </text>
      <rect x="244" y="130" width="560" height="300" rx="12" fill="#f8fffd" stroke="#ccfbf1" />
      {['Luna  · Canino  · Ana Pérez', 'Misha · Felino  · Carlos Díaz', 'Rocky · Canino  · Sofía Gómez', 'Coco  · Canino  · Ana Pérez'].map(
        (row, i) => (
          <g key={row}>
            <circle cx="268" cy={168 + i * 64} r="16" fill="#ccfbf1" />
            <text x="262" y={173 + i * 64} fontSize="14">
              {i % 2 === 0 ? '🐶' : '🐱'}
            </text>
            <text x="296" y={174 + i * 64} fill="#134e4a" fontSize="14" fontFamily="Segoe UI, sans-serif">
              {row}
            </text>
            <rect x="700" y={156 + i * 64} width="80" height="24" rx="8" fill="#ffffff" stroke="#99f6e4" />
            <text x="716" y={172 + i * 64} fill="#0f766e" fontSize="11" fontFamily="Segoe UI, sans-serif">
              Ver ficha
            </text>
          </g>
        )
      )}
    </Chrome>
  );
}

export function MockBilling() {
  return (
    <Chrome title="Facturación · caja">
      <text x="244" y="108" fill="#134e4a" fontSize="18" fontFamily="Georgia, serif" fontWeight="700">
        Factura #1042
      </text>
      <rect x="244" y="128" width="340" height="280" rx="12" fill="#f8fffd" stroke="#ccfbf1" />
      <text x="260" y="156" fill="#0f766e" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Ítems
      </text>
      {['Consulta clínica     $18.000', 'Vacuna séxtuple     $12.500', 'Antiparasitario     $ 6.200'].map((row, i) => (
        <text key={row} x="260" y={186 + i * 28} fill="#334155" fontSize="13" fontFamily="Segoe UI, sans-serif">
          {row}
        </text>
      ))}
      <text x="260" y="380" fill="#0d9488" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Total  $36.700
      </text>
      <rect x="604" y="128" width="200" height="280" rx="12" fill="#0d9488" />
      <text x="624" y="164" fill="#fff" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Caja abierta
      </text>
      <text x="624" y="200" fill="#ccfbf1" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Efectivo
      </text>
      <text x="624" y="218" fill="#fff" fontSize="18" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        $24.500
      </text>
      <text x="624" y="260" fill="#ccfbf1" fontSize="12" fontFamily="Segoe UI, sans-serif">
        Transferencia
      </text>
      <text x="624" y="278" fill="#fff" fontSize="18" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        $12.200
      </text>
      <rect x="624" y="340" width="160" height="36" rx="8" fill="#fff" />
      <text x="658" y="363" fill="#0f766e" fontSize="12" fontFamily="Segoe UI, sans-serif" fontWeight="700">
        Registrar cobro
      </text>
    </Chrome>
  );
}
