import type { TutorialDefinition, TutorialStep } from './types';

export type TutorialRouteDecision =
  | { kind: 'same'; href: string }
  | { kind: 'navigate'; href: string }
  | { kind: 'blocked-permission'; href: string | null }
  | { kind: 'demo-fallback'; href: string };

export interface ResolveTutorialRouteInput {
  tutorial: TutorialDefinition;
  step: TutorialStep;
  pathname: string;
  /** Authorized demo appointment id for the current org only; never foreign clinics. */
  demoAppointmentId: string | null;
  hasPermission: (permission: string) => boolean;
}

function normalizePath(path: string): string {
  if (!path) return '/';
  const bare = path.split('?')[0]?.split('#')[0] ?? path;
  if (bare.length > 1 && bare.endsWith('/')) return bare.slice(0, -1);
  return bare || '/';
}

/**
 * Resolves the href for a tutorial step and whether navigation is required.
 * Pure helper — safe for unit tests and the interactive engine.
 */
export function resolveTutorialRoute(input: ResolveTutorialRouteInput): TutorialRouteDecision {
  const { tutorial, step, pathname, demoAppointmentId, hasPermission } = input;
  const current = normalizePath(pathname);

  if (step.validation?.requirePermission && !hasPermission(step.validation.requirePermission)) {
    return {
      kind: 'blocked-permission',
      href: step.route ? normalizePath(step.route) : normalizePath(tutorial.startRoute),
    };
  }

  if (step.requiresDemoAppointment) {
    if (demoAppointmentId) {
      const href = normalizePath(`/agenda/${demoAppointmentId}`);
      return href === current ? { kind: 'same', href } : { kind: 'navigate', href };
    }
    if (step.allowDemoFallback) {
      const href = normalizePath(step.route ?? tutorial.startRoute);
      return { kind: 'demo-fallback', href };
    }
    const href = normalizePath(tutorial.startRoute);
    return href === current ? { kind: 'same', href } : { kind: 'navigate', href };
  }

  const href = normalizePath(step.route ?? tutorial.startRoute);
  if (href === current) return { kind: 'same', href };
  return { kind: 'navigate', href };
}

export function pathsMatch(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}
