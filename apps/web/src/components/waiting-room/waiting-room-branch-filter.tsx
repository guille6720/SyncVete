'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { appendWaitingRoomBoardFilterParams } from '@sincvete/shared';

interface WaitingRoomBranchFilterProps {
  branchOptions: Array<{ id: string; name: string }>;
  sessionBranchId: string | null;
  branchFilter: string | 'all' | null | undefined;
  variant?: 'light' | 'dark';
  className?: string;
}

export function WaitingRoomBranchFilter({
  branchOptions,
  sessionBranchId,
  branchFilter,
  variant = 'light',
  className,
}: WaitingRoomBranchFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (branchOptions.length <= 1) return null;

  const dark = variant === 'dark';
  const branchValue =
    branchFilter === 'all' ? 'all' : branchFilter ?? sessionBranchId ?? '';

  const onBranchChange = (value: string) => {
    const nextBranchId = value === 'all' ? 'all' : value || undefined;
    const params = appendWaitingRoomBoardFilterParams(
      new URLSearchParams(searchParams.toString()),
      {
        query: '',
        status: 'all',
        assignedUserId: null,
        branchId: nextBranchId,
      }
    );
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    router.refresh();
  };

  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm',
        dark ? 'text-slate-300' : 'text-muted-foreground',
        className
      )}
    >
      <span className={dark ? 'text-slate-400' : undefined}>Sucursal</span>
      <Select
        value={branchValue}
        onChange={(event) => onBranchChange(event.target.value)}
        className={cn(
          'min-w-[10rem]',
          dark && 'border-white/20 bg-white/5 text-slate-100'
        )}
      >
        <option value="">Mi sucursal</option>
        <option value="all">Todas</option>
        {branchOptions.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
