import { Cat, Dog, PawPrint, Rabbit } from 'lucide-react';
export function OwnerPetIcon({ species, className }: { species: string; className?: string }) {
  const Icon =
    species === 'Canino'
      ? Dog
      : species === 'Felino'
        ? Cat
        : species === 'Lagomorfo'
          ? Rabbit
          : PawPrint;
  return <Icon aria-hidden="true" className={className || 'h-8 w-8 text-primary'} />;
}
