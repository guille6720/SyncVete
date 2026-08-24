import { revalidatePath } from 'next/cache';

/**
 * Narrow cache invalidation for clinical mutations.
 * Prefer entity + patient paths over fan-out to /dashboard and sibling modules.
 * Dashboard widgets may lag until next visit — acceptable; PHI consistency on
 * the patient/record the user just edited must stay correct.
 */

export function revalidatePatient(patientId: string) {
  revalidatePath(`/pacientes/${patientId}`);
}

export function revalidatePatientHistoria(patientId: string) {
  revalidatePath(`/pacientes/${patientId}/historia`);
  revalidatePath(`/pacientes/${patientId}`);
}

export function revalidateClinicalEntry(entryId: string, patientId?: string | null) {
  revalidatePath(`/historia-clinica/${entryId}`);
  revalidatePath('/historia-clinica');
  if (patientId) revalidatePatientHistoria(patientId);
}

export function revalidateClinicalEntryList() {
  revalidatePath('/historia-clinica');
}

export function revalidatePrescription(prescriptionId: string, patientId?: string | null) {
  revalidatePath('/farmacia');
  revalidatePath(`/farmacia/${prescriptionId}`);
  if (patientId) revalidatePatient(patientId);
}

export function revalidatePrescriptionBoard(patientId?: string | null) {
  revalidatePath('/farmacia');
  if (patientId) revalidatePatient(patientId);
}

export function revalidateConsultation(consultationId: string) {
  revalidatePath('/consultas');
  revalidatePath(`/consultas/${consultationId}`);
}

export function revalidateConsultationDetail(consultationId: string) {
  revalidatePath(`/consultas/${consultationId}`);
}

export function revalidateAgenda(appointmentId?: string | null) {
  revalidatePath('/agenda');
  if (appointmentId) revalidatePath(`/agenda/${appointmentId}`);
}

export function revalidateWaitingRoom() {
  revalidatePath('/sala-espera');
}

export function revalidatePatientsList() {
  revalidatePath('/pacientes');
}

/** Only when a dashboard counter truly must refresh (create/delete volume events). */
export function revalidateDashboard() {
  revalidatePath('/dashboard');
}

/** Waiting Room mutations that also affect agenda/dashboard widgets. */
export function revalidateWaitingRoomSurfaces(appointmentId?: string | null) {
  revalidateWaitingRoom();
  revalidateAgenda(appointmentId);
  revalidateDashboard();
}
