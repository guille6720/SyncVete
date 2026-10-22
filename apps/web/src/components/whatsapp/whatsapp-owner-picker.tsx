'use client';

import { useEffect, useRef, useState } from 'react';
import { searchOwnersForSelect } from '@/actions/owners';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

interface WhatsAppOwnerPickerProps {
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  error?: string;
  onOwnerChange?: (owner: { id: string; full_name: string } | null) => void;
}

export function WhatsAppOwnerPicker({
  defaultOwnerId = '',
  defaultOwnerName = '',
  error,
  onOwnerChange,
}: WhatsAppOwnerPickerProps) {
  const [query, setQuery] = useState(defaultOwnerName);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [results, setResults] = useState<Array<{ id: string; full_name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    searchOwnersForSelect(debouncedQuery)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor="ownerSearch">Tutor *</Label>
      <div className="relative">
        <Input
          id="ownerSearch"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOwnerId('');
            onOwnerChange?.(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar tutor..."
          autoComplete="off"
        />
        {open && (results.length > 0 || loading) && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
            {loading && <li className="px-3 py-2 text-sm text-muted-foreground">Buscando...</li>}
            {results.map((owner) => (
              <li key={owner.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-accent',
                    ownerId === owner.id && 'bg-accent'
                  )}
                  onClick={() => {
                    setOwnerId(owner.id);
                    setQuery(owner.full_name);
                    setOpen(false);
                    onOwnerChange?.(owner);
                  }}
                >
                  {owner.full_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
