import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Approvals } from './Approvals';
import { HolidaysAdmin } from './HolidaysAdmin';
import { MyTimeOff } from './MyTimeOff';
import { TeamCalendar } from './TeamCalendar';

type Tab = 'mine' | 'approvals' | 'calendar' | 'holidays';

export function TimeOffPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');

  const canApprove = can('timeoff:approve');
  const canViewTeam = canApprove || can('timeoff:read');
  const canManageHolidays = can('timeoff:admin');

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'mine', label: 'My time off', show: true },
    { id: 'approvals', label: 'Approvals', show: canApprove },
    { id: 'calendar', label: 'Team calendar', show: canViewTeam },
    { id: 'holidays', label: 'Holidays', show: canManageHolidays },
  ];
  const visible = tabs.filter((t) => t.show);

  return (
    <div>
      <PageHeader title="Time Off" description="Request leave and track your balances." />

      {visible.length > 1 ? (
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {visible.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'rounded-md bg-collins-700 px-4 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'mine' ? <MyTimeOff /> : null}
      {tab === 'approvals' && canApprove ? <Approvals /> : null}
      {tab === 'calendar' && canViewTeam ? <TeamCalendar /> : null}
      {tab === 'holidays' && canManageHolidays ? <HolidaysAdmin /> : null}
    </div>
  );
}
