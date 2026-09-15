'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type SettlementsNavContextValue = {
  showMySettlementsNav: boolean;
  setShowMySettlementsNav: (show: boolean) => void;
};

const SettlementsNavContext = createContext<SettlementsNavContextValue | null>(null);

export function SettlementsNavProvider({
  children,
  initial = false,
}: {
  children: ReactNode;
  initial?: boolean;
}) {
  const [showMySettlementsNav, setShowMySettlementsNavState] = useState(initial);
  const setShowMySettlementsNav = useCallback((show: boolean) => {
    setShowMySettlementsNavState(show);
  }, []);
  const value = useMemo(
    () => ({ showMySettlementsNav, setShowMySettlementsNav }),
    [showMySettlementsNav, setShowMySettlementsNav]
  );
  return (
    <SettlementsNavContext.Provider value={value}>{children}</SettlementsNavContext.Provider>
  );
}

export function useShowMySettlementsNav(fallback = false): boolean {
  const ctx = useContext(SettlementsNavContext);
  return ctx?.showMySettlementsNav ?? fallback;
}

/** Server-streamed flag hydrates client nav without blocking layout. */
export function SettlementsNavFlagReceiver({ show }: { show: boolean }) {
  const setShow = useContext(SettlementsNavContext)?.setShowMySettlementsNav;
  useEffect(() => {
    setShow?.(show);
  }, [setShow, show]);
  return null;
}
