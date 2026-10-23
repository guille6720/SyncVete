'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const notify = () => window.dispatchEvent(new Event('syncvete:app-update'));
        if (reg.waiting) notify();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
          });
        });
        window.setInterval(() => {
          void reg.update();
        }, 60_000);
      })
      .catch(() => {
        /* installability is optional */
      });
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
  }, []);

  return null;
}
