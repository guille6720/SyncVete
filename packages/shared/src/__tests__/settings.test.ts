import { describe, expect, it } from 'vitest';
import {
  formatWaitingRoomRoomsText,
  generateBranchCode,
  isWaitingRoomPortalAlertsEnabled,
  mergeOrganizationSettings,
  normalizeWaitingRoomRooms,
  parseOrganizationSettings,
} from '../utils/settings';

describe('parseOrganizationSettings', () => {
  it('returns defaults for empty input', () => {
    expect(parseOrganizationSettings(null)).toEqual({});
    expect(parseOrganizationSettings({})).toEqual({});
  });

  it('parses known fields', () => {
    expect(
      parseOrganizationSettings({
        timezone: 'America/Argentina/Buenos_Aires',
        currency: 'ARS',
        phone: '123',
        waitingRoomRooms: ['Consultorio 1', 'Box A', 'Consultorio 1'],
        waitingRoomMinutesPerPatient: 12,
        settlementPeriodPreset: 'biweekly',
        settlementPeriodDays: 14,
      })
    ).toEqual({
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'ARS',
      phone: '123',
      waitingRoomRooms: ['Consultorio 1', 'Box A'],
      waitingRoomMinutesPerPatient: 12,
      settlementPeriodPreset: 'biweekly',
      settlementPeriodDays: 14,
    });
  });
});

describe('mergeOrganizationSettings', () => {
  it('merges settings without dropping unknown keys', () => {
    const result = mergeOrganizationSettings({ custom: true }, { currency: 'USD' });
    expect(result).toEqual({ custom: true, currency: 'USD' });
  });

  it('clears default month settlement preset on merge', () => {
    const result = mergeOrganizationSettings(
      { settlementPeriodPreset: 'biweekly', settlementPeriodDays: 14 },
      { settlementPeriodPreset: 'month' }
    );
    expect(result.settlementPeriodPreset).toBeUndefined();
    expect(result.settlementPeriodDays).toBe(14);
  });

  it('clears waiting-room overrides with null or empty rooms', () => {
    const result = mergeOrganizationSettings(
      {
        waitingRoomRooms: ['1'],
        waitingRoomMinutesPerPatient: 20,
        currency: 'ARS',
      },
      {
        waitingRoomRooms: [],
        waitingRoomMinutesPerPatient: null,
      }
    );
    expect(result).toEqual({ currency: 'ARS' });
  });

  it('stores disabled portal alerts and omits enabled default', () => {
    expect(
      mergeOrganizationSettings({}, { waitingRoomPortalAlertsEnabled: false })
    ).toEqual({ waitingRoomPortalAlertsEnabled: false });
    expect(
      mergeOrganizationSettings(
        { waitingRoomPortalAlertsEnabled: false },
        { waitingRoomPortalAlertsEnabled: true }
      )
    ).toEqual({});
  });

  it('omits disabled board sound and stores enabled', () => {
    expect(
      mergeOrganizationSettings({}, { waitingRoomBoardSoundEnabled: true })
    ).toEqual({ waitingRoomBoardSoundEnabled: true });
    expect(
      mergeOrganizationSettings(
        { waitingRoomBoardSoundEnabled: true },
        { waitingRoomBoardSoundEnabled: false }
      )
    ).toEqual({});
  });
});

describe('waiting room portal alerts setting', () => {
  it('defaults to enabled and parses explicit false', () => {
    expect(isWaitingRoomPortalAlertsEnabled(null)).toBe(true);
    expect(isWaitingRoomPortalAlertsEnabled({})).toBe(true);
    expect(isWaitingRoomPortalAlertsEnabled({ waitingRoomPortalAlertsEnabled: false })).toBe(false);
    expect(
      parseOrganizationSettings({ waitingRoomPortalAlertsEnabled: false }).waitingRoomPortalAlertsEnabled
    ).toBe(false);
  });

  it('parses board sound opt-in', () => {
    expect(parseOrganizationSettings({}).waitingRoomBoardSoundEnabled).toBeUndefined();
    expect(
      parseOrganizationSettings({ waitingRoomBoardSoundEnabled: true }).waitingRoomBoardSoundEnabled
    ).toBe(true);
    expect(
      parseOrganizationSettings({ waitingRoomBoardSoundEnabled: false }).waitingRoomBoardSoundEnabled
    ).toBe(false);
  });
});

describe('waiting room room presets', () => {
  it('normalizes and formats room lists', () => {
    expect(normalizeWaitingRoomRooms('1\nBox A, box a;Quirófano')).toEqual([
      '1',
      'Box A',
      'Quirófano',
    ]);
    expect(formatWaitingRoomRoomsText(['1', 'Box A'])).toBe('1\nBox A');
  });
});

describe('generateBranchCode', () => {
  it('generates uppercase code from name', () => {
    expect(generateBranchCode('Sucursal Norte')).toBe('SUCURSAL_NOR');
  });
});
