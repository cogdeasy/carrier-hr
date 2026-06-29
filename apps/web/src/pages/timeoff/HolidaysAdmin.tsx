import type { CompanyHoliday, CreateCompanyHolidayInput } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Input } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';

export function HolidaysAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: holidays = [], isLoading, isError } = useQuery({
    queryKey: ['timeoff', 'holidays'],
    queryFn: () => api.get<CompanyHoliday[]>('/time-off/holidays'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/time-off/holidays/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['timeoff', 'holidays'] }),
  });

  return (
    <Card>
      <CardHeader
        title="Company holidays"
        subtitle="Holidays are excluded from working-day counts on every request"
        action={
          <Button leftIcon={<Plus className="h-4 w-4" />} size="sm" onClick={() => setOpen(true)}>
            Add holiday
          </Button>
        }
      />
      <CardBody className="p-0">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="p-6">
            <EmptyState icon={CalendarDays} title="Couldn't load holidays" description="Please try again." />
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={CalendarDays} title="No holidays configured" description="Add your first company holiday." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Date</TH>
                <TH>Region</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {holidays.map((h) => (
                <TR key={h.id}>
                  <TD className="font-medium text-slate-900">{h.name}</TD>
                  <TD>{formatDate(h.date)}</TD>
                  <TD>{h.region}</TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      loading={removeMutation.isPending && removeMutation.variables === h.id}
                      onClick={() => removeMutation.mutate(h.id)}
                    >
                      Remove
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
      <HolidayModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function HolidayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [region, setRegion] = useState('US');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateCompanyHolidayInput) => api.post('/time-off/holidays', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff', 'holidays'] });
      setName('');
      setDate('');
      setRegion('US');
      setError(null);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to add holiday'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ name, date, region });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add company holiday"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="holiday-form" type="submit" loading={mutation.isPending}>
            Add holiday
          </Button>
        </>
      }
    >
      <form id="holiday-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" htmlFor="hol-name">
          <Input id="hol-name" required value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="hol-date">
          <Input id="hol-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Region" htmlFor="hol-region">
          <Input id="hol-region" required value={region} maxLength={16} onChange={(e) => setRegion(e.target.value)} />
        </Field>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
