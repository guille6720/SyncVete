import { describe, expect, it } from 'vitest';
import { AGENDA_BASICO_TUTORIAL, resolveTutorialRoute } from '../tutorials';

describe('resolveTutorialRoute', () => {
  const tutorial = AGENDA_BASICO_TUTORIAL;
  const allow = () => true;
  const deny = () => false;

  it('navigates from /academia start to /agenda for welcome', () => {
    const step = tutorial.steps[0]!;
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/academia',
      demoAppointmentId: null,
      hasPermission: allow,
    });
    expect(decision.kind).toBe('navigate');
    if (decision.kind === 'navigate') expect(decision.href).toBe('/agenda');
  });

  it('stays on /agenda when already there', () => {
    const step = tutorial.steps.find((s) => s.id === 'day-overview')!;
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/agenda',
      demoAppointmentId: null,
      hasPermission: allow,
    });
    expect(decision).toEqual({ kind: 'same', href: '/agenda' });
  });

  it('uses demo fallback for detail steps without demo appointment', () => {
    const step = tutorial.steps.find((s) => s.id === 'appointment-detail')!;
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/agenda',
      demoAppointmentId: null,
      hasPermission: allow,
    });
    expect(decision.kind).toBe('demo-fallback');
    if (decision.kind === 'demo-fallback') expect(decision.href).toBe('/agenda');
  });

  it('navigates to authorized demo appointment detail when available', () => {
    const step = tutorial.steps.find((s) => s.id === 'appointment-detail')!;
    const demoId = '11111111-1111-1111-1111-111111111111';
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/agenda',
      demoAppointmentId: demoId,
      hasPermission: allow,
    });
    expect(decision).toEqual({
      kind: 'navigate',
      href: `/agenda/${demoId}`,
    });
  });

  it('blocks write steps without appointments:write', () => {
    const step = tutorial.steps.find((s) => s.id === 'appointment-form')!;
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/agenda',
      demoAppointmentId: null,
      hasPermission: deny,
    });
    expect(decision.kind).toBe('blocked-permission');
  });

  it('supports navigating backwards to /agenda from /agenda/nueva', () => {
    const step = tutorial.steps.find((s) => s.id === 'week-nav')!;
    const decision = resolveTutorialRoute({
      tutorial,
      step,
      pathname: '/agenda/nueva',
      demoAppointmentId: null,
      hasPermission: allow,
    });
    expect(decision).toEqual({ kind: 'navigate', href: '/agenda' });
  });
});
