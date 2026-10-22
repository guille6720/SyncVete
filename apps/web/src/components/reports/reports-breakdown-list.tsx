import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface BreakdownItem {
  label: string;
  value: string;
  secondaryValue?: string;
  count: number;
  href?: string;
}

interface ReportsBreakdownListProps {
  title: string;
  description?: string;
  items: BreakdownItem[];
  emptyLabel: string;
}

export function ReportsBreakdownList({
  title,
  description,
  items,
  emptyLabel,
}: ReportsBreakdownListProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              const row = (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-right text-muted-foreground">
                      {item.value} ({pct}%)
                      {item.secondaryValue ? (
                        <span className="block text-xs">Saldo: {item.secondaryValue}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </>
              );
              return (
                <li key={item.label} className="space-y-1">
                  {item.href ? (
                    <Link href={item.href} className="block transition-colors hover:opacity-90">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
