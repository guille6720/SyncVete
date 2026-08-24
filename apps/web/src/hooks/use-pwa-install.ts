'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  isIosInstallableBrowser,
  isPwaStandalone,
  readInstallDismissed,
  writeInstallDismissed,
} from '@/lib/pwa';

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    setDismissed(readInstallDismissed());
    setStandalone(isPwaStandalone());
    setIsIosSafari(isIosInstallableBrowser());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const canInstallNative = Boolean(deferredPrompt);
  const canShowIosHint = isIosSafari && !standalone;
  const visible = !dismissed && !standalone && (canInstallNative || canShowIosHint);

  const dismiss = useCallback(() => {
    writeInstallDismissed();
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    visible,
    canInstallNative,
    canShowIosHint,
    dismiss,
    install,
  };
}
