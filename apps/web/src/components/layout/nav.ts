import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Settings,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Permission required to see this item; undefined = visible to all authenticated users. */
  permission?: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    heading: 'People',
    items: [
      { label: 'Directory', to: '/directory', icon: Users },
      { label: 'Org Chart', to: '/org-chart', icon: Users },
      { label: 'Onboarding', to: '/onboarding', icon: Briefcase },
    ],
  },
  {
    heading: 'Work',
    items: [
      { label: 'Time Off', to: '/time-off', icon: CalendarDays },
      { label: 'Timesheets', to: '/timesheets', icon: Clock },
    ],
  },
  {
    heading: 'Rewards',
    items: [
      { label: 'Payroll', to: '/payroll', icon: Wallet },
      { label: 'Benefits', to: '/benefits', icon: HeartPulse },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { label: 'Performance', to: '/performance', icon: Target },
      { label: 'Learning', to: '/learning', icon: GraduationCap },
    ],
  },
  {
    heading: 'Talent',
    items: [
      { label: 'Recruiting', to: '/recruiting', icon: BookOpen, permission: 'recruiting:read' },
    ],
  },
  {
    heading: 'Company',
    items: [
      { label: 'Documents', to: '/documents', icon: FileText },
      { label: 'Analytics', to: '/analytics', icon: BarChart3, permission: 'analytics:read' },
    ],
  },
  {
    heading: 'Administration',
    items: [{ label: 'Settings', to: '/settings', icon: Settings, permission: 'settings:admin' }],
  },
];
