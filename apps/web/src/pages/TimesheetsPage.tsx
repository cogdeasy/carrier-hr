import type { SaveTimesheetInput, Timesheet } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface DraftEntry {
  date: string;
  project: string;
  hours: string;
  notes: string;
}

export function TimesheetsPage() {
  const qc = useQueryClient();
  const [weekStarting, setWeekStarting] = useState(() => mondayOf(new Date()));
  const [draft, setDraft] = useState<DraftEntry[]>([]);

  const { data: week, isLoading } = useQuery({
    queryKey: ['timesheets', 'week', weekStarting],
    queryFn: () => api.get<Timesheet>(`/timesheets/week/${weekStarting}`),
  });

  useEffect(() => {
    if (week) {
      setDraft(
        week.entries.map((e) => ({
          date: e.date,
          project: e.project,
          hours: String(e.hours),
          notes: e.notes ?? '',
        })),
      );
    }
  }, [week]);

  const save = useMutation({
    mutationFn: (input: SaveTimesheetInput) => api.put<Timesheet>('/timesheets', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/timesheets/${id}/submit`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  if (isLoading || !week) return <LoadingPage />;

  const editable = week.status === 'draft' || week.status === 'rejected';
  const totalHours = draft.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  function persist() {
    save.mutate({
      weekStarting,
      entries: draft
        .filter((e) => e.project && Number(e.hours) > 0)
        .map((e) => ({
          date: e.date,
          project: e.project,
          hours: Number(e.hours),
          notes: e.notes || undefined,
        })),
    });
  }

  return (
    <div>
      <PageHeader title="Timesheets" description="Log your hours and submit for approval." />

      <Card>
        <CardHeader
          title={`Week of ${formatDate(weekStarting)}`}
          subtitle={`${totalHours} hours total`}
          action={<Badge tone={statusTone(week.status)}>{titleCase(week.status)}</Badge>}
        />
        <CardBody>
          <div className="mb-4 flex items-center gap-3">
            <Input
              type="date"
              className="w-auto"
              value={weekStarting}
              onChange={(e) => setWeekStarting(mondayOf(new Date(e.target.value)))}
            />
          </div>

          <div className="space-y-2">
            {draft.map((entry, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input
                  type="date"
                  className="col-span-3"
                  disabled={!editable}
                  value={entry.date}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...entry, date: e.target.value };
                    setDraft(next);
                  }}
                />
                <Input
                  className="col-span-5"
                  placeholder="Project"
                  disabled={!editable}
                  value={entry.project}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...entry, project: e.target.value };
                    setDraft(next);
                  }}
                />
                <Input
                  type="number"
                  className="col-span-2"
                  placeholder="Hours"
                  min={0}
                  max={24}
                  disabled={!editable}
                  value={entry.hours}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...entry, hours: e.target.value };
                    setDraft(next);
                  }}
                />
                <div className="col-span-2 flex items-center">
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft(draft.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {editable ? (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  setDraft([
                    ...draft,
                    { date: weekStarting, project: '', hours: '', notes: '' },
                  ])
                }
              >
                Add row
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" loading={save.isPending} onClick={persist}>
                  Save draft
                </Button>
                <Button
                  leftIcon={<Send className="h-4 w-4" />}
                  loading={submit.isPending}
                  onClick={() => submit.mutate(week.id)}
                >
                  Submit
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
