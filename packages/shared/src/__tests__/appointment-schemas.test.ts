import { describe, expect, it } from 'vitest';
import {
  appointmentSchema,
  appointmentListSchema,
  professionalScheduleSchema,
  waitlistEntrySchema,
} from '../schemas';

describe('appointmentSchema', () => {
  const validPatientId = '550e8400-e29b-41d4-a716-446655440000';
  const validOwnerId = '550e8400-e29b-41d4-a716-446655440001';

  it('validates minimal appointment', () => {
    const result = appointmentSchema.safeParse({
      patientId: validPatientId,
      ownerId: validOwnerId,
      startsAt: '2024-08-15T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appointmentType).toBe('consulta');
      expect(result.data.durationMinutes).toBe(30);
    }
  });

  it('rejects missing patient', () => {
    const result = appointmentSchema.safeParse({
      ownerId: validOwnerId,
      startsAt: '2024-08-15T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('clears empty optional fields', () => {
    const result = appointmentSchema.safeParse({
      patientId: validPatientId,
      ownerId: validOwnerId,
      startsAt: '2024-08-15T12:00:00.000Z',
      assignedUserId: '',
      title: '',
      notes: '',
      branchId: '',
      consultationMode: '',
      expectedPaymentMethod: '',
      room: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedUserId).toBeUndefined();
      expect(result.data.title).toBeUndefined();
      expect(result.data.branchId).toBeUndefined();
      expect(result.data.consultationMode).toBeUndefined();
      expect(result.data.expectedPaymentMethod).toBeUndefined();
      expect(result.data.room).toBeUndefined();
    }
  });

  it('accepts consultation mode, payment and remind flags', () => {
    const result = appointmentSchema.safeParse({
      patientId: validPatientId,
      ownerId: validOwnerId,
      startsAt: '2024-08-15T12:00:00.000Z',
      consultationMode: 'video',
      expectedPaymentMethod: 'mercadopago',
      room: 'Box 2',
      remind24h: 'on',
      remind2h: false,
      remindConfirmation: 'true',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consultationMode).toBe('video');
      expect(result.data.expectedPaymentMethod).toBe('mercadopago');
      expect(result.data.room).toBe('Box 2');
      expect(result.data.remind24h).toBe(true);
      expect(result.data.remind2h).toBe(false);
      expect(result.data.remindConfirmation).toBe(true);
    }
  });
});

describe('appointmentListSchema', () => {
  it('accepts week and calendar filters', () => {
    const result = appointmentListSchema.safeParse({
      weekStart: '2024-08-12',
      from: '2024-08-01',
      to: '2024-08-31',
      query: 'luna',
      view: 'month',
    });
    expect(result.success).toBe(true);
  });

  it('clears empty query', () => {
    const result = appointmentListSchema.safeParse({
      from: '2024-08-01',
      to: '2024-08-07',
      query: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBeUndefined();
    }
  });
});

describe('schedule and waitlist schemas', () => {
  it('validates professional schedule', () => {
    const result = professionalScheduleSchema.safeParse({
      branchId: '550e8400-e29b-41d4-a716-446655440010',
      userId: '550e8400-e29b-41d4-a716-446655440011',
      weekday: 1,
      startTime: '09:00',
      endTime: '13:00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slotDurationMinutes).toBe(30);
      expect(result.data.isActive).toBe(true);
    }
  });

  it('parses waitlist preferred weekdays from csv', () => {
    const result = waitlistEntrySchema.safeParse({
      branchId: '550e8400-e29b-41d4-a716-446655440010',
      ownerId: '550e8400-e29b-41d4-a716-446655440001',
      patientId: '550e8400-e29b-41d4-a716-446655440000',
      preferredWeekdays: '1,3,5',
      preferredTimeStart: '09:00',
      preferredTimeEnd: '12:00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredWeekdays).toEqual([1, 3, 5]);
      expect(result.data.preferredTimeStart).toBe('09:00:00');
      expect(result.data.preferredTimeEnd).toBe('12:00:00');
    }
  });
});
