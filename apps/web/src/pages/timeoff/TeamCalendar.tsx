import type { TimeOffRequest } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Input } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { typeLabel } from './constants';

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export function TeamCalendar() {
  const [{ from, to }, setRange] = useState(monthBounds);

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['timeoff', 'calendar', { from, to }],
    queryFn: () => api.get<TimeOffRequest[]>('/time-off/calendar', { from, to }),
    enabled: Boolean(from && to && to >= from),
  });

  return (
    <Card>
      <CardHeader title="Team calendar" subtitle="Who is off during the selected window" />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Field label="From" htmlFor="cal-from">
            <Input id="cal-from" type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </Field>
          <Field label="To" htmlFor="cal-to">
            <Input id="cal-to" type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </Field>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : isError ? (
          <EmptyState icon={CalendarDays} title="Couldn't load the calendar" description="Please try again in a moment." />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No one is off"
            description="No approved or pending leave overlaps this window."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <Avatar name={e.employee?.displayName ?? 'Employee'} src={e.employee?.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {e.employee?.displayName ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {typeLabel(e.type)} · {formatDate(e.startDate)} – {formatDate(e.endDate)} · {e.totalDays} day(s)
                  </p>
                </div>
                <Badge tone={statusTone(e.status)}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
