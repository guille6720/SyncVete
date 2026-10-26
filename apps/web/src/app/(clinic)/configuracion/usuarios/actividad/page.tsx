import { redirect } from 'next/navigation';

/** Legacy path — module moved outside Configuración. */
export default function LegacyManagedUsersActivityRedirect() {
  redirect('/usuarios/actividad');
}
