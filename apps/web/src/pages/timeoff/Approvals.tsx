import type { TimeOffRequest } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { typeLabel } from './constants';

type Decision = 'approved' | 'rejected';

export function Approvals() {
  const [active, setActive] = useState<{ request: TimeOffRequest; decision: Decision } | null>(null);
  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: ['timeoff', 'approvals'],
    queryFn: () => api.get<TimeOffRequest[]>('/time-off/approvals'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={X} title="Couldn't load approvals" description="Please try again in a moment." />
        </CardBody>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={Check} title="All caught up" description="No pending requests to review." />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Pending approvals" subtitle="Requests awaiting your decision" />
      <CardBody className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH>Dates</TH>
              <TH>Days</TH>
              <TH>Reason</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={r.employee?.displayName ?? 'Employee'} src={r.employee?.avatarUrl} size="sm" />
                    <span className="font-medium text-slate-900">{r.employee?.displayName ?? '—'}</span>
                  </div>
                </TD>
                <TD>{typeLabel(r.type)}</TD>
                <TD>
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </TD>
                <TD>{r.totalDays}</TD>
                <TD className="max-w-xs truncate text-slate-500">
                  {r.reason ?? '—'}
                  {r.attachmentUrl ? (
                    <>
                      {' '}
                      <a
                        href={r.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-collins-700 underline"
                      >
                        attachment
                      </a>
                    </>
                  ) : null}
                </TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => setActive({ request: r, decision: 'rejected' })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      leftIcon={<Check className="h-4 w-4" />}
                      onClick={() => setActive({ request: r, decision: 'approved' })}
                    >
                      Approve
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardBody>
      <DecisionModal active={active} onClose={() => setActive(null)} />
    </Card>
  );
}

function DecisionModal({
  active,
  onClose,
}: {
  active: { request: TimeOffRequest; decision: Decision } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: Decision }) =>
      api.post(`/time-off/requests/${id}/decision`, { decision, decisionNote: note || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff'] });
      setNote('');
      setError(null);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to record decision'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setError(null);
    mutation.mutate({ id: active.request.id, decision: active.decision });
  }

  const decision = active?.decision;
  return (
    <Modal
      open={active != null}
      onClose={onClose}
      title={decision === 'approved' ? 'Approve request' : 'Reject request'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="decision-form"
            type="submit"
            variant={decision === 'approved' ? 'primary' : 'danger'}
            loading={mutation.isPending}
          >
            {decision === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      {active ? (
        <form id="decision-form" onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-slate-600">
            {active.request.employee?.displayName ?? 'Employee'} · {typeLabel(active.request.type)} ·{' '}
            {active.request.totalDays} day(s)
          </p>
          <Field label="Note (optional)" htmlFor="decision-note">
            <Textarea
              id="decision-note"
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
