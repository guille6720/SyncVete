import Image from 'next/image';
import type { OwnerAppBrand } from '@/lib/owner-app';

export function OwnerAppBrandMark({ brand }: { brand: OwnerAppBrand }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {brand.logoUrl && (
        <Image
          unoptimized
          src={brand.logoUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-md object-contain"
        />
      )}
      <span className="break-words text-base font-semibold" style={{ color: brand.primaryColor }}>
        {brand.appName}
      </span>
    </div>
  );
}
