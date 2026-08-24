import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ReportStat {
  label: string;
  value: string;
  description?: string;
  icon: LucideIcon;
}

interface ReportsStatGridProps {
  title: string;
  description?: string;
  stats: ReportStat[];
  action?: ReactNode;
}

export function ReportsStatGrid({ title, description, stats, action }: ReportsStatGridProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.description && <CardDescription>{stat.description}</CardDescription>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
