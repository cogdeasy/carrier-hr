import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../lib/cn';
import { Logo } from '../Logo';
import { NAV_SECTIONS } from './nav';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-100 px-5">
        <Logo />
        <span className="ml-2 text-sm font-semibold text-slate-400">HR</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.permission || can(i.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.heading}>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.heading}
              </p>
              <ul className="mt-2 space-y-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                          isActive
                            ? 'bg-collins-50 text-collins-800'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4 text-xs text-slate-400">
        Collins Aerospace
      </div>
    </aside>
  );
}
