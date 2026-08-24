import { previewAppointmentCheckIn } from '@/actions/waiting-room';
import { CheckInPublicPage } from '@/components/waiting-room/check-in-public-page';

interface CheckInTokenPageProps {
  params: Promise<{ token: string }>;
}

export default async function CheckInTokenPage({ params }: CheckInTokenPageProps) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken ?? '').trim();
  const preview = await previewAppointmentCheckIn(token);

  return <CheckInPublicPage token={token} preview={preview} />;
}
