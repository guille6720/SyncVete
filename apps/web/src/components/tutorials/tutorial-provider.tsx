'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  useTutorialEngine,
  type TutorialEngineApi,
} from '@/components/tutorials/use-tutorial-engine';
import { TutorialOverlay } from '@/components/tutorials/tutorial-overlay';
import { getAcademiaDemoAppointmentId } from '@/actions/academia-demo';

const TutorialContext = createContext<TutorialEngineApi | null>(null);

interface TutorialProviderProps {
  children: React.ReactNode;
  organizationId?: string | null;
  userId?: string | null;
  permissions?: string[];
  enabled?: boolean;
}

export function TutorialProvider({
  children,
  organizationId,
  userId,
  permissions,
  enabled = true,
}: TutorialProviderProps) {
  const router = useRouter();
  const pathname = usePathname() || '/';

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  const resolveDemoAppointmentId = useCallback(async () => {
    return getAcademiaDemoAppointmentId();
  }, []);

  const engine = useTutorialEngine({
    organizationId,
    userId,
    permissions,
    pathname,
    navigate,
    resolveDemoAppointmentId,
  });
  const value = useMemo(() => engine, [engine]);

  if (!enabled) return <>{children}</>;

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay engine={value} />
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialEngineApi {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial debe usarse dentro de TutorialProvider');
  }
  return ctx;
}

export function useOptionalTutorial(): TutorialEngineApi | null {
  return useContext(TutorialContext);
}
