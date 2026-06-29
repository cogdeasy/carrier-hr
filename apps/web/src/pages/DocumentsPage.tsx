import type {
  CreateDocumentInput,
  DocumentCategory,
  DocumentVersion,
  Employee,
  HrDocument,
  Paginated,
  SignatureRequest,
} from '@collins-hr/shared';
import { DOCUMENT_CATEGORIES } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  FileText,
  Inbox,
  PenLine,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { titleCase } from '../lib/format';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusTone: Record<SignatureRequest['status'], BadgeTone> = {
  pending: 'warning',
  signed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Something went wrong.';
  return (
    <EmptyState
      icon={AlertCircle}
      title="Unable to load documents"
      description={message}
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

export function DocumentsPage() {
  const { can } = useAuth();
  const isAdmin = can('document:admin');
  const [tab, setTab] = useState<'library' | 'inbox'>('library');

  const inbox = useQuery({
    queryKey: ['documents', 'inbox'],
    queryFn: () => api.get<HrDocument[]>('/documents/inbox'),
  });
  const inboxCount = inbox.data?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Company policies, contracts, and personal records — with e-signature tracking."
      />

      <div className="mb-5 flex gap-2 border-b border-slate-200" role="tablist" aria-label="Documents views">
        <TabButton active={tab === 'library'} onClick={() => setTab('library')} id="tab-library">
          Library
        </TabButton>
        <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')} id="tab-inbox">
          <span className="inline-flex items-center gap-2">
            Awaiting my signature
            {inboxCount > 0 ? <Badge tone="warning">{inboxCount}</Badge> : null}
          </span>
        </TabButton>
      </div>

      {tab === 'library' ? (
        <LibraryTab isAdmin={isAdmin} />
      ) : (
        <InboxTab query={inbox} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  id,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? 'border-collins-700 text-collins-800'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function LibraryTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'' | DocumentCategory>('');
  const [visibility, setVisibility] = useState<'' | 'company' | 'personal'>('');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['documents', 'list', { q, category, visibility }],
    queryFn: () =>
      api.get<{ items: HrDocument[]; total: number }>('/documents', {
        q: q || undefined,
        category: category || undefined,
        visibility: visibility || undefined,
        pageSize: 100,
      }),
  });

  if (list.isLoading) return <LoadingPage />;

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="doc-search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                id="doc-search"
                className="pl-9"
                placeholder="Search documents"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Category" htmlFor="doc-category">
            <Select
              id="doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              <option value="">All categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility" htmlFor="doc-visibility">
            <Select
              id="doc-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <option value="">All</option>
              <option value="company">Company-wide</option>
              <option value="personal">Personal</option>
            </Select>
          </Field>
        </div>
        {isAdmin ? (
          <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setShowUpload(true)}>
            Upload document
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Document library" subtitle={`${items.length} document${items.length === 1 ? '' : 's'}`} />
        <CardBody className="p-0">
          {list.isError ? (
            <div className="p-6">
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="No documents found"
                description="Try adjusting your filters or upload a new document."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Visibility</TH>
                  <TH>Version</TH>
                  <TH>Size</TH>
                  <TH>Updated</TH>
                  <TH>Signatures</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((doc) => (
                  <TR
                    key={doc.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedId(doc.id)}
                  >
                    <TD>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-900">{doc.name}</div>
                          {doc.status === 'archived' ? (
                            <span className="text-xs text-slate-400">Archived</span>
                          ) : null}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone="collins">{titleCase(doc.category)}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={doc.visibility === 'company' ? 'info' : 'neutral'}>
                        {doc.visibility === 'company' ? 'Company' : 'Personal'}
                      </Badge>
                    </TD>
                    <TD>v{doc.version}</TD>
                    <TD>{formatBytes(doc.sizeBytes)}</TD>
                    <TD>{formatDate(doc.updatedAt)}</TD>
                    <TD>
                      <SignatureCell doc={doc} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {showUpload ? (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onCreated={() => {
            setShowUpload(false);
            void qc.invalidateQueries({ queryKey: ['documents'] });
          }}
        />
      ) : null}

      {selectedId ? (
        <DocumentDetail
          documentId={selectedId}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function SignatureCell({ doc }: { doc: HrDocument }) {
  if (!doc.requiresSignature) return <span className="text-xs text-slate-400">Not required</span>;
  if (doc.signatures) {
    const { signed, total, declined } = doc.signatures;
    return (
      <span className="text-xs text-slate-600">
        {signed}/{total} signed{declined > 0 ? `, ${declined} declined` : ''}
      </span>
    );
  }
  return doc.signedAt ? <Badge tone="success">Signed</Badge> : <Badge tone="warning">Pending</Badge>;
}

function InboxTab({ query }: { query: ReturnType<typeof useQuery<HrDocument[]>> }) {
  if (query.isLoading) return <LoadingPage />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const docs = query.data ?? [];
  return (
    <Card>
      <CardHeader title="Awaiting my signature" />
      <CardBody className={docs.length === 0 ? '' : 'p-0'}>
        {docs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="You're all caught up"
            description="No documents are currently awaiting your signature."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((doc) => (
              <InboxRow key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function InboxRow({ doc }: { doc: HrDocument }) {
  const qc = useQueryClient();
  const [declining, setDeclining] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const sign = useMutation({
    mutationFn: () => api.post(`/documents/${doc.id}/sign`),
    onSuccess: refresh,
  });

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-slate-400" />
        <div>
          <div className="font-medium text-slate-900">{doc.name}</div>
          <div className="text-xs text-slate-500">
            {titleCase(doc.category)} · {formatBytes(doc.sizeBytes)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDeclining(true)}>
          Decline
        </Button>
        <Button
          size="sm"
          leftIcon={<PenLine className="h-4 w-4" />}
          loading={sign.isPending}
          onClick={() => sign.mutate()}
        >
          Sign
        </Button>
      </div>
      {declining ? (
        <DeclineModal
          documentId={doc.id}
          onClose={() => setDeclining(false)}
          onDone={() => {
            setDeclining(false);
            refresh();
          }}
        />
      ) : null}
    </li>
  );
}

function DeclineModal({
  documentId,
  onClose,
  onDone,
}: {
  documentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const decline = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/decline`, { reason }),
    onSuccess: onDone,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Decline signature"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length === 0}
            loading={decline.isPending}
            onClick={() => decline.mutate()}
          >
            Decline
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="decline-reason" error={decline.isError ? 'Could not submit. Try again.' : undefined}>
        <Textarea
          id="decline-reason"
          rows={3}
          placeholder="Let HR know why you can't sign this document."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

function UploadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    category: 'policy' as DocumentCategory,
    description: '',
    contentType: 'application/pdf',
    url: '',
    sizeKb: '',
    visibility: 'company' as 'company' | 'personal',
    employeeId: '',
    requiresSignature: false,
  });
  const create = useMutation({
    mutationFn: () => {
      const body: CreateDocumentInput = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        contentType: form.contentType.trim(),
        url: form.url.trim(),
        sizeBytes: Math.round((Number(form.sizeKb) || 0) * 1024),
        requiresSignature: form.requiresSignature,
        employeeId: form.visibility === 'personal' ? form.employeeId : null,
      };
      return api.post<HrDocument>('/documents', body);
    },
    onSuccess: onCreated,
  });

  const valid =
    form.name.trim() &&
    form.url.trim() &&
    (form.visibility === 'company' || form.employeeId);

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={!valid}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (valid) create.mutate();
        }}
      >
        {create.isError ? (
          <p className="text-sm text-red-600">
            {create.error instanceof ApiError ? create.error.message : 'Could not create document.'}
          </p>
        ) : null}
        <Field label="Name" htmlFor="up-name">
          <Input id="up-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="up-desc">
          <Textarea
            id="up-desc"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="up-cat">
            <Select
              id="up-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility" htmlFor="up-vis">
            <Select
              id="up-vis"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value as 'company' | 'personal' })}
            >
              <option value="company">Company-wide</option>
              <option value="personal">Personal (one employee)</option>
            </Select>
          </Field>
        </div>
        {form.visibility === 'personal' ? (
          <Field label="Employee" htmlFor="up-emp">
            <EmployeePicker
              value={form.employeeId ? [form.employeeId] : []}
              multiple={false}
              onChange={(ids) => setForm({ ...form, employeeId: ids[0] ?? '' })}
            />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="File URL" htmlFor="up-url">
            <Input id="up-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </Field>
          <Field label="Size (KB)" htmlFor="up-size">
            <Input
              id="up-size"
              type="number"
              min={0}
              value={form.sizeKb}
              onChange={(e) => setForm({ ...form, sizeKb: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.requiresSignature}
            onChange={(e) => setForm({ ...form, requiresSignature: e.target.checked })}
          />
          Requires signature
        </label>
      </form>
    </Modal>
  );
}

function EmployeePicker({
  value,
  onChange,
  multiple,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  multiple: boolean;
}) {
  const [search, setSearch] = useState('');
  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => api.get<Paginated<Employee>>('/employees', { pageSize: 100 }),
  });
  const filtered = useMemo(() => {
    const all = employees.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (e) => e.displayName.toLowerCase().includes(term) || e.email.toLowerCase().includes(term),
    );
  }, [employees.data, search]);

  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 p-2">
        <Input placeholder="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {employees.isLoading ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No employees found.</p>
        ) : (
          filtered.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                checked={value.includes(e.id)}
                onChange={() => toggle(e.id)}
              />
              <span className="font-medium text-slate-800">{e.displayName}</span>
              <span className="text-xs text-slate-400">{e.jobTitle}</span>
            </label>
          ))
        )}
      </div>
      {multiple && value.length > 0 ? (
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          {value.length} selected
        </div>
      ) : null}
    </div>
  );
}

function DocumentDetail({
  documentId,
  isAdmin,
  onClose,
}: {
  documentId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [requesting, setRequesting] = useState(false);

  const doc = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () => api.get<HrDocument>(`/documents/${documentId}`),
  });
  const versions = useQuery({
    queryKey: ['documents', documentId, 'versions'],
    queryFn: () => api.get<DocumentVersion[]>(`/documents/${documentId}/versions`),
  });
  const signatures = useQuery({
    queryKey: ['documents', documentId, 'signatures'],
    queryFn: () => api.get<SignatureRequest[]>(`/documents/${documentId}/signatures`),
    enabled: isAdmin,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const remind = useMutation({
    mutationFn: (id: string) => api.post(`/documents/signature-requests/${id}/remind`),
    onSuccess: () => void signatures.refetch(),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/documents/signature-requests/${id}/cancel`),
    onSuccess: () => {
      void signatures.refetch();
      refresh();
    },
  });

  const d = doc.data;

  return (
    <Modal open onClose={onClose} title={d?.name ?? 'Document'}>
      {doc.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : doc.isError || !d ? (
        <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone="collins">{titleCase(d.category)}</Badge>
            <Badge tone={d.visibility === 'company' ? 'info' : 'neutral'}>
              {d.visibility === 'company' ? 'Company-wide' : 'Personal'}
            </Badge>
            <Badge tone="neutral">v{d.version}</Badge>
            {d.status === 'archived' ? <Badge tone="danger">Archived</Badge> : null}
          </div>

          {d.description ? <p className="text-sm text-slate-600">{d.description}</p> : null}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-400">Type</dt>
              <dd className="text-slate-800">{d.contentType}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Size</dt>
              <dd className="text-slate-800">{formatBytes(d.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Updated</dt>
              <dd className="text-slate-800">{formatDate(d.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Signature</dt>
              <dd className="text-slate-800">
                {!d.requiresSignature
                  ? 'Not required'
                  : d.signatures
                    ? `${d.signatures.signed}/${d.signatures.total} signed`
                    : d.signedAt
                      ? 'Signed'
                      : 'Pending'}
              </dd>
            </div>
          </dl>

          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-collins-700 hover:underline"
          >
            <FileText className="h-4 w-4" /> Open file
          </a>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Version history</h3>
            {versions.isLoading ? (
              <Spinner />
            ) : (
              <ul className="space-y-1 text-sm">
                {(versions.data ?? []).map((v) => (
                  <li key={v.id} className="flex justify-between text-slate-600">
                    <span>
                      v{v.version} · {formatBytes(v.sizeBytes)}
                      {v.note ? ` — ${v.note}` : ''}
                    </span>
                    <span className="text-slate-400">{formatDate(v.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin ? (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Signature requests</h3>
                <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setRequesting(true)}>
                  Request signatures
                </Button>
              </div>
              {signatures.isLoading ? (
                <Spinner />
              ) : (signatures.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No signature requests yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {(signatures.data ?? []).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <Badge tone={statusTone[r.status]}>{titleCase(r.status)}</Badge>
                        {r.declineReason ? (
                          <span className="ml-2 text-xs text-slate-500">{r.declineReason}</span>
                        ) : null}
                      </div>
                      {r.status === 'pending' ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Bell className="h-3.5 w-3.5" />}
                            loading={remind.isPending && remind.variables === r.id}
                            onClick={() => remind.mutate(r.id)}
                          >
                            {r.remindersSent > 0 ? `Remind (${r.remindersSent})` : 'Remind'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<X className="h-3.5 w-3.5" />}
                            loading={cancel.isPending && cancel.variables === r.id}
                            onClick={() => cancel.mutate(r.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : d.requiresSignature && !d.signedAt ? (
            <SignActions documentId={d.id} onDone={refresh} />
          ) : null}
        </div>
      )}

      {requesting ? (
        <RequestSignaturesModal
          documentId={documentId}
          onClose={() => setRequesting(false)}
          onDone={() => {
            setRequesting(false);
            void signatures.refetch();
            refresh();
          }}
        />
      ) : null}
    </Modal>
  );
}

function SignActions({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const [declining, setDeclining] = useState(false);
  const sign = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/sign`),
    onSuccess: onDone,
  });
  return (
    <div className="flex gap-2 border-t border-slate-100 pt-4">
      <Button leftIcon={<PenLine className="h-4 w-4" />} loading={sign.isPending} onClick={() => sign.mutate()}>
        Sign document
      </Button>
      <Button variant="outline" onClick={() => setDeclining(true)}>
        Decline
      </Button>
      {declining ? (
        <DeclineModal
          documentId={documentId}
          onClose={() => setDeclining(false)}
          onDone={() => {
            setDeclining(false);
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}

function RequestSignaturesModal({
  documentId,
  onClose,
  onDone,
}: {
  documentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post(`/documents/${documentId}/signature-requests`, {
        employeeIds,
        message: message.trim() || undefined,
      }),
    onSuccess: onDone,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Request signatures"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={employeeIds.length === 0} loading={create.isPending} onClick={() => create.mutate()}>
            Send {employeeIds.length > 0 ? `(${employeeIds.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.isError ? (
          <p className="text-sm text-red-600">
            {create.error instanceof ApiError ? create.error.message : 'Could not send requests.'}
          </p>
        ) : null}
        <Field label="Employees" htmlFor="req-emp">
          <EmployeePicker value={employeeIds} multiple onChange={setEmployeeIds} />
        </Field>
        <Field label="Message (optional)" htmlFor="req-msg">
          <Textarea
            id="req-msg"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a note for the signers."
          />
        </Field>
      </div>
    </Modal>
  );
}
