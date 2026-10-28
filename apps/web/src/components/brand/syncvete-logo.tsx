import Image from 'next/image';
import Link from 'next/link';
import { APP_NAME } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import logoOnLight from '../../../public/brand/logo.png';
import logoOnDark from '../../../public/brand/logo-dark.png';

type BrandLogoProps = {
  href?: string;
  className?: string;
  /** Visual size preset */
  size?: 'sm' | 'md' | 'lg' | 'hero' | 'sidebar';
  /** High-contrast artwork keeps the wordmark readable on either surface. */
  variant?: 'onLight' | 'onDark';
  priority?: boolean;
};

const SIZE_CLASS: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'h-11 w-11',
  md: 'h-14 w-14',
  lg: 'h-32 w-32',
  hero: 'h-40 w-40 sm:h-48 lg:h-56',
  sidebar: 'h-auto w-full max-h-40',
};

const SIZE_PX: Record<NonNullable<BrandLogoProps['size']>, { width: number; height: number }> = {
  sm: { width: 140, height: 40 },
  md: { width: 168, height: 48 },
  lg: { width: 256, height: 256 },
  hero: { width: 512, height: 512 },
  sidebar: { width: 512, height: 512 },
};

export function BrandLogo({
  href,
  className,
  size = 'md',
  variant = 'onLight',
  priority = false,
}: BrandLogoProps) {
  const dims = SIZE_PX[size];
  const src = variant === 'onDark' ? logoOnDark : logoOnLight;
  const image = (
    <Image
      src={src}
      alt={APP_NAME}
      width={dims.width}
      height={dims.height}
      priority={priority}
      className={cn(SIZE_CLASS[size], 'rounded-2xl bg-black object-contain', className)}
    />
  );

  if (!href) return image;

  return (
    <Link
      href={href}
      className={cn('inline-flex items-center', size === 'sidebar' && 'block w-full')}
      aria-label={APP_NAME}
    >
      {image}
    </Link>
  );
}
