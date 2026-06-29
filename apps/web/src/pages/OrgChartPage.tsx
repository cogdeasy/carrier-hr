import type { OrgNode } from '@carrier-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { Card, CardBody } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';

export function OrgChartPage() {
  const { data: roots = [], isLoading } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get<OrgNode[]>('/employees/org-chart'),
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader title="Org Chart" description="Explore Carrier's reporting structure." />
      <Card>
        <CardBody>
          {roots.map((node) => (
            <OrgNodeRow key={node.id} node={node} depth={0} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function OrgNodeRow({ node, depth }: { node: OrgNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasReports = node.reports.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg py-1.5 hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex h-5 w-5 items-center justify-center text-slate-400"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasReports ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : null}
        </button>
        <Link to={`/directory/${node.id}`} className="flex items-center gap-3 py-1">
          <Avatar name={node.displayName} src={node.avatarUrl} size="sm" />
          <div>
            <p className="text-sm font-medium text-slate-900">{node.displayName}</p>
            <p className="text-xs text-slate-500">{node.jobTitle}</p>
          </div>
          {hasReports ? (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {node.reports.length}
            </span>
          ) : null}
        </Link>
      </div>
      {expanded && hasReports
        ? node.reports.map((child) => <OrgNodeRow key={child.id} node={child} depth={depth + 1} />)
        : null}
    </div>
  );
}
