'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SvPerfReport } from '@/lib/perf/nav-timing';

const STORAGE_CLICK = 'sv-perf-click-ms';
const STORAGE_HREF = 'sv-perf-click-href';

export function markNavPerfClick(href: string): void {
  try {
    sessionStorage.setItem(STORAGE_CLICK, String(performance.now()));
    sessionStorage.setItem(STORAGE_HREF, href);
  } catch {
    /* ignore */
  }
}

function shouldShowOverlay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('sv-perf') === '1') return true;
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
  } catch {
    /* ignore */
  }
  return process.env.NEXT_PUBLIC_SV_PERF_TIMING === '1';
}

interface PerfNavProbeProps {
  report: SvPerfReport | null;
}

/**
 * Staging/dev probe: compares sidebar click → shell props arrival,
 * and prints server marks from the latest RSC layout render.
 */
export function PerfNavProbe({ report }: PerfNavProbeProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [clientNavMs, setClientNavMs] = useState<number | null>(null);
  const [lastReport, setLastReport] = useState<SvPerfReport | null>(null);

  useEffect(() => {
    setVisible(shouldShowOverlay());
  }, [pathname]);

  useEffect(() => {
    if (!report) return;
    setLastReport(report);

    let clickMs: number | null = null;
    let clickHref: string | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_CLICK);
      clickHref = sessionStorage.getItem(STORAGE_HREF);
      if (raw) clickMs = Number(raw);
      sessionStorage.removeItem(STORAGE_CLICK);
      sessionStorage.removeItem(STORAGE_HREF);
    } catch {
      /* ignore */
    }

    const client =
      clickMs != null && Number.isFinite(clickMs)
        ? Math.round((performance.now() - clickMs) * 10) / 10
        : null;
    setClientNavMs(client);

    const row = {
      path: report.path,
      clientClickToShellMs: client,
      clickHref,
      ...report.marks,
      totalMs: report.totalMs,
    };
    console.info('[SV_PERF client]', row);
    console.table(row);
  }, [report]);

  if (!visible || !lastReport) return null;

  const marks = Object.entries(lastReport.marks).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className="fixed bottom-3 right-3 z-[100] max-h-[50vh] w-[min(100vw-1.5rem,22rem)] overflow-auto rounded-lg border border-amber-500/40 bg-slate-950/95 p-3 text-[11px] text-amber-50 shadow-xl backdrop-blur"
      role="status"
      aria-label="SyncVete navigation performance"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-amber-200">SV_PERF · {lastReport.path}</p>
        <button
          type="button"
          className="text-amber-200/70 underline"
          onClick={() => {
            try {
              localStorage.removeItem('sv-perf');
            } catch {
              /* ignore */
            }
            setVisible(false);
          }}
        >
          ocultar
        </button>
      </div>
      <p className="mb-1 text-amber-100/80">
        Click → shell:{' '}
        <span className="font-mono text-amber-50">
          {clientNavMs != null ? `${clientNavMs} ms` : '—'}
        </span>
      </p>
      <p className="mb-2 text-amber-100/80">
        Layout total:{' '}
        <span className="font-mono text-amber-50">{lastReport.totalMs} ms</span>
      </p>
      <ul className="space-y-0.5 font-mono">
        {marks.map(([name, ms]) => (
          <li key={name} className="flex justify-between gap-2">
            <span className="truncate text-amber-100/70">{name}</span>
            <span>{ms.toFixed(1)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-amber-100/50">
        Activá con <code>?perf=1</code> o <code>localStorage.sv-perf=1</code>
      </p>
    </div>
  );
}
