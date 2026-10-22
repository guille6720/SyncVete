import { OwnerPetIcon } from './owner-pet-icon';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
} as const;

export function OwnerPetAvatar({
  name,
  species,
  photoUrl,
  size = 'md',
  className,
  ring = false,
}: {
  name: string;
  species: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  ring?: boolean;
}) {
  const box = SIZE[size];
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- pet photos from clinic storage URLs
      <img
        src={photoUrl}
        alt={name}
        className={cn(
          box,
          'shrink-0 rounded-2xl object-cover',
          ring && 'ring-2 ring-white/80 shadow-md',
          className
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        box,
        'flex shrink-0 items-center justify-center rounded-2xl bg-accent',
        ring && 'ring-2 ring-white/80 shadow-md',
        className
      )}
      aria-label={name}
    >
      <OwnerPetIcon
        species={species}
        className={size === 'lg' ? 'h-10 w-10 text-primary' : 'h-7 w-7 text-primary'}
      />
    </span>
  );
}
