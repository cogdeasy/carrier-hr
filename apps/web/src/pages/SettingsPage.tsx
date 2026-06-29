import type {
  AdminUser,
  AuditLog,
  CompanyHoliday,
  OrgSettings,
  Paginated,
  Role,
  UpdateOrgSettingsInput,
} from '@collins-hr/shared';
import { ROLES, ROLE_LABELS } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  KeyRound,
  ScrollText,
  ShieldAlert,
  Users as UsersIcon,
} from 'lucide-react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';

type TabKey = 'users' | 'organization' | 'audit';

const TABS: { key: TabKey; label: string; icon: typeof UsersIcon }[] = [
  { key: 'users', label: 'Users & Roles', icon: UsersIcon },
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
];

export function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<TabKey>('users');

  if (!can('settings:admin')) {
    return (
      <div>
        <PageHeader title="Settings" />
        <EmptyState
          icon={ShieldAlert}
          title="Access restricted"
          description="You need administrator permissions to manage platform settings."
        />
      </div>
    );
  }

  const canAudit = can('audit:read');
  const visibleTabs = TABS.filter((t) => t.key !== 'audit' || canAudit);

  return (
    <div>
      <PageHeader
        title="Settings & Administration"
        description="Manage users, roles, organization profile, and the audit trail."
      />

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6" aria-label="Settings sections">
          {visibleTabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex items-center gap-2 border-b-2 border-collins-700 px-1 py-3 text-sm font-semibold text-collins-800'
                    : 'flex items-center gap-2 border-b-2 border-transparent px-1 py-3 text-sm font-medium text-slate-500 hover:text-slate-700'
                }
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === 'users' ? <UsersSection /> : null}
      {tab === 'organization' ? <OrganizationSection /> : null}
      {tab === 'audit' && canAudit ? <AuditSection /> : null}
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = ['active', 'on_leave', 'terminated', 'pre_start'] as const;

function UsersSection() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'users', { page, search, roleFilter, statusFilter }],
    queryFn: () =>
      api.get<Paginated<AdminUser>>('/admin/users', {
        page,
        pageSize: 10,
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post<AdminUser>(`/admin/users/${id}/status`, { status }),
    onSuccess: invalidate,
    onError: (err) => setActionError(errorMessage(err, 'Failed to update status')),
  });

  const resetPassword = useMutation({
    mutationFn: (u: AdminUser) =>
      api.post<{ temporaryPassword: string }>(`/admin/users/${u.employeeId}/reset-password`),
    onSuccess: (res, u) => {
      setResetResult({ name: u.displayName, password: res.temporaryPassword });
      invalidate();
    },
    onError: (err) => setActionError(errorMessage(err, 'Failed to reset password')),
  });

  const result = query.data;
  const users = result?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Search" htmlFor="user-search">
              <Input
                id="user-search"
                placeholder="Name or email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <div className="w-full sm:w-48">
            <Field label="Role" htmlFor="role-filter">
              <Select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-full sm:w-48">
            <Field label="Status" htmlFor="status-filter">
              <Select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      ) : null}

      <Card>
        <CardHeader title="User accounts" subtitle={`${result?.total ?? 0} users`} />
        <CardBody className="p-0">
          {query.isLoading ? (
            <div className="py-10">
              <LoadingPage />
            </div>
          ) : query.isError ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldAlert}
                title="Could not load users"
                description="Please retry in a moment."
                action={<Button onClick={() => query.refetch()}>Retry</Button>}
              />
            </div>
          ) : users.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={UsersIcon} title="No users match these filters" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Roles</TH>
                  <TH>Status</TH>
                  <TH>Last login</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((u) => {
                  const isSelf = u.employeeId === currentUser?.employeeId;
                  return (
                    <TR key={u.userId}>
                      <TD>
                        <div className="font-medium text-slate-900">{u.displayName}</div>
                        <div className="text-xs text-slate-400">{u.jobTitle}</div>
                      </TD>
                      <TD>{u.email}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-slate-400">None</span>
                          ) : (
                            u.roles.map((r) => (
                              <Badge key={r} tone="collins">
                                {ROLE_LABELS[r]}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={statusTone(u.status)}>{u.status.replace('_', ' ')}</Badge>
                        {u.mustChangePassword ? (
                          <div className="mt-1 text-xs text-amber-600">Password reset pending</div>
                        ) : null}
                      </TD>
                      <TD>
                        {u.lastLoginAt ? (
                          formatDateTime(u.lastLoginAt)
                        ) : (
                          <span className="text-xs text-slate-400">Never</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRoleTarget(u)}>
                            Roles
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<KeyRound className="h-3.5 w-3.5" />}
                            loading={resetPassword.isPending && resetPassword.variables?.userId === u.userId}
                            onClick={() => {
                              setActionError(null);
                              resetPassword.mutate(u);
                            }}
                          >
                            Reset
                          </Button>
                          {u.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={isSelf}
                              title={isSelf ? 'You cannot deactivate your own account' : undefined}
                              loading={
                                setStatus.isPending && setStatus.variables?.id === u.employeeId
                              }
                              onClick={() => {
                                setActionError(null);
                                setStatus.mutate({ id: u.employeeId, status: 'terminated' });
                              }}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={
                                setStatus.isPending && setStatus.variables?.id === u.employeeId
                              }
                              onClick={() => {
                                setActionError(null);
                                setStatus.mutate({ id: u.employeeId, status: 'active' });
                              }}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Pagination
        page={result?.page ?? 1}
        totalPages={result?.totalPages ?? 1}
        onChange={setPage}
      />

      {roleTarget ? (
        <RoleModal
          user={roleTarget}
          onClose={() => setRoleTarget(null)}
          onSaved={() => {
            setRoleTarget(null);
            invalidate();
          }}
        />
      ) : null}

      <Modal
        open={resetResult !== null}
        onClose={() => setResetResult(null)}
        title="Temporary password issued"
        footer={<Button onClick={() => setResetResult(null)}>Done</Button>}
      >
        <p className="text-sm text-slate-600">
          Share this one-time password with <strong>{resetResult?.name}</strong>. They must change
          it at next sign-in. It will not be shown again.
        </p>
        <pre className="mt-3 rounded-lg bg-slate-100 px-4 py-3 font-mono text-sm text-slate-900">
          {resetResult?.password}
        </pre>
      </Modal>
    </div>
  );
}

function RoleModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Role[]>(user.roles);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.put<AdminUser>(`/admin/users/${user.employeeId}/roles`, { roles: selected }),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err, 'Failed to update roles')),
  });

  const toggle = (role: Role) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Roles — ${user.displayName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={selected.length === 0} onClick={() => save.mutate()}>
            Save roles
          </Button>
        </>
      }
    >
      {error ? (
        <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="sr-only">Select roles</legend>
        {ROLES.map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-collins-700"
              checked={selected.includes(role)}
              onChange={() => toggle(role)}
            />
            <span className="text-sm font-medium text-slate-800">{ROLE_LABELS[role]}</span>
          </label>
        ))}
      </fieldset>
      {selected.length === 0 ? (
        <p className="mt-2 text-xs text-amber-600">Select at least one role.</p>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function OrganizationSection() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<OrgSettings>('/admin/settings'),
  });
  const holidaysQuery = useQuery({
    queryKey: ['admin', 'holidays'],
    queryFn: () => api.get<CompanyHoliday[]>('/admin/holidays'),
  });

  const [form, setForm] = useState<UpdateOrgSettingsInput | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = settingsQuery.data;
  const current: UpdateOrgSettingsInput | null = useMemo(() => {
    if (!settings) return null;
    return {
      legalName: settings.legalName,
      displayName: settings.displayName,
      parentCompany: settings.parentCompany,
      headquarters: settings.headquarters,
      supportEmail: settings.supportEmail,
      phone: settings.phone,
      website: settings.website,
      timezone: settings.timezone,
      fiscalYearStartMonth: settings.fiscalYearStartMonth,
    };
  }, [settings]);

  const value = form ?? current;

  const save = useMutation({
    mutationFn: (patch: UpdateOrgSettingsInput) => api.put<OrgSettings>('/admin/settings', patch),
    onSuccess: (data) => {
      setSavedAt(data.updatedAt);
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
    onError: (err) => setError(errorMessage(err, 'Failed to save settings')),
  });

  if (settingsQuery.isLoading) return <LoadingPage />;
  if (settingsQuery.isError || !settings || !value) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Could not load organization settings"
        action={<Button onClick={() => settingsQuery.refetch()}>Retry</Button>}
      />
    );
  }

  const update = (patch: Partial<UpdateOrgSettingsInput>) =>
    setForm((prev) => ({ ...(prev ?? current!), ...patch }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader title="Company profile" subtitle="Visible across the platform." />
          <CardBody>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                save.mutate(value);
              }}
            >
              <Field label="Display name" htmlFor="org-display">
                <Input
                  id="org-display"
                  value={value.displayName ?? ''}
                  onChange={(e) => update({ displayName: e.target.value })}
                />
              </Field>
              <Field label="Legal name" htmlFor="org-legal">
                <Input
                  id="org-legal"
                  value={value.legalName ?? ''}
                  onChange={(e) => update({ legalName: e.target.value })}
                />
              </Field>
              <Field label="Parent company" htmlFor="org-parent">
                <Input
                  id="org-parent"
                  value={value.parentCompany ?? ''}
                  onChange={(e) => update({ parentCompany: e.target.value })}
                />
              </Field>
              <Field label="Headquarters" htmlFor="org-hq">
                <Input
                  id="org-hq"
                  value={value.headquarters ?? ''}
                  onChange={(e) => update({ headquarters: e.target.value })}
                />
              </Field>
              <Field label="Support email" htmlFor="org-email">
                <Input
                  id="org-email"
                  type="email"
                  value={value.supportEmail ?? ''}
                  onChange={(e) => update({ supportEmail: e.target.value })}
                />
              </Field>
              <Field label="Phone" htmlFor="org-phone">
                <Input
                  id="org-phone"
                  value={value.phone ?? ''}
                  onChange={(e) => update({ phone: e.target.value })}
                />
              </Field>
              <Field label="Website" htmlFor="org-web">
                <Input
                  id="org-web"
                  value={value.website ?? ''}
                  onChange={(e) => update({ website: e.target.value })}
                />
              </Field>
              <Field label="Timezone" htmlFor="org-tz">
                <Input
                  id="org-tz"
                  value={value.timezone ?? ''}
                  onChange={(e) => update({ timezone: e.target.value })}
                />
              </Field>
              <Field label="Fiscal year start" htmlFor="org-fy">
                <Select
                  id="org-fy"
                  value={String(value.fiscalYearStartMonth ?? 1)}
                  onChange={(e) => update({ fiscalYearStartMonth: Number(e.target.value) })}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" loading={save.isPending} disabled={form === null}>
                  Save changes
                </Button>
                {form !== null ? (
                  <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                    Discard
                  </Button>
                ) : null}
                {savedAt ? (
                  <span className="text-xs text-emerald-600">Saved {formatDateTime(savedAt)}</span>
                ) : null}
                {error ? (
                  <span role="alert" className="text-xs text-red-600">
                    {error}
                  </span>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <ListCard title="Divisions" items={settings.divisions} />
          <ListCard title="Departments" items={settings.departments} />
          <ListCard title="Locations" items={settings.locations} />
        </div>
      </div>

      <Card>
        <CardHeader
          title="Company holidays"
          subtitle={`${holidaysQuery.data?.length ?? 0} observed`}
        />
        <CardBody className="p-0">
          {holidaysQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (holidaysQuery.data?.length ?? 0) === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title="No holidays configured" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {holidaysQuery.data!.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-800">{h.name}</span>
                  <span className="text-xs text-slate-400">{formatDate(h.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${items.length}`} />
      <CardBody className="p-0">
        {items.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">None</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item} className="px-5 py-2 text-sm text-slate-700">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function AuditSection() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const facets = useQuery({
    queryKey: ['admin', 'audit', 'facets'],
    queryFn: () => api.get<{ actions: string[]; entities: string[] }>('/admin/audit/facets'),
  });

  const query = useQuery({
    queryKey: ['admin', 'audit', { page, action, entity, from, to }],
    queryFn: () =>
      api.get<Paginated<AuditLog>>('/admin/audit', {
        page,
        pageSize: 15,
        action: action || undefined,
        entity: entity || undefined,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      }),
  });

  const result = query.data;
  const logs = result?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-4">
          <Field label="Action" htmlFor="audit-action">
            <Select
              id="audit-action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All actions</option>
              {(facets.data?.actions ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entity" htmlFor="audit-entity">
            <Select
              id="audit-entity"
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All entities</option>
              {(facets.data?.entities ?? []).map((en) => (
                <option key={en} value={en}>
                  {en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="audit-from">
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To" htmlFor="audit-to">
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Audit trail" subtitle={`${result?.total ?? 0} records`} />
        <CardBody className="p-0">
          {query.isLoading ? (
            <div className="py-10">
              <LoadingPage />
            </div>
          ) : query.isError ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldAlert}
                title="Could not load audit log"
                action={<Button onClick={() => query.refetch()}>Retry</Button>}
              />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={ScrollText} title="No audit records match these filters" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Details</TH>
                </TR>
              </THead>
              <TBody>
                {logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD>{log.actorName ?? <span className="text-slate-400">System</span>}</TD>
                    <TD>
                      <Badge tone="info">{log.action}</Badge>
                    </TD>
                    <TD>
                      <span className="text-slate-700">{log.entity}</span>
                      {log.entityId ? (
                        <span className="ml-1 text-xs text-slate-400">#{log.entityId}</span>
                      ) : null}
                    </TD>
                    <TD>
                      {log.metadata ? (
                        <code className="text-xs text-slate-500">
                          {JSON.stringify(log.metadata)}
                        </code>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Pagination
        page={result?.page ?? 1}
        totalPages={result?.totalPages ?? 1}
        onChange={setPage}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
