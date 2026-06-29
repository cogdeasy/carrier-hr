import type { OrgNode } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Network, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { titleCase } from '../lib/format';

function collectIds(nodes: OrgNode[], acc: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    acc.add(node.id);
    collectIds(node.reports, acc);
  }
  return acc;
}

/** Returns the subtree filtered to branches containing a match, plus the set of
 * node ids that must be expanded to reveal those matches. */
function filterTree(
  nodes: OrgNode[],
  query: string,
): { nodes: OrgNode[]; expanded: Set<string> } {
  const expanded = new Set<string>();
  const walk = (list: OrgNode[]): OrgNode[] =>
    list.flatMap((node) => {
      const reports = walk(node.reports);
      const selfMatch =
        node.displayName.toLowerCase().includes(query) ||
        node.jobTitle.toLowerCase().includes(query);
      if (selfMatch || reports.length > 0) {
        if (reports.length > 0) expanded.add(node.id);
        return [{ ...node, reports }];
      }
      return [];
    });
  return { nodes: walk(nodes), expanded };
}

export function OrgChartPage() {
  const { data: roots = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get<OrgNode[]>('/employees/org-chart'),
  });

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string> | null>(null);

  const query = search.trim().toLowerCase();
  const { nodes, autoExpanded } = useMemo(() => {
    if (!query) return { nodes: roots, autoExpanded: null as Set<string> | null };
    const result = filterTree(roots, query);
    return { nodes: result.nodes, autoExpanded: result.expanded };
  }, [roots, query]);

  // Default to expanding the top two levels until the user toggles anything.
  const defaultExpanded = useMemo(() => {
    const acc = new Set<string>();
    const walk = (list: OrgNode[], depth: number) => {
      for (const node of list) {
        if (depth < 2) acc.add(node.id);
        walk(node.reports, depth + 1);
      }
    };
    walk(roots, 0);
    return acc;
  }, [roots]);

  const effectiveExpanded = query ? (autoExpanded ?? new Set()) : (expanded ?? defaultExpanded);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev ?? defaultExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="Org Chart"
        description="Explore Collins Aerospace's reporting structure."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded(collectIds(roots))}>
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
              Collapse all
            </Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Find a person or title…"
          aria-label="Search org chart"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardBody>
          {isError ? (
            <EmptyState
              icon={Network}
              title="Couldn't load the org chart"
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  Try again
                </Button>
              }
            />
          ) : nodes.length === 0 ? (
            <EmptyState
              icon={Network}
              title={query ? 'No matches' : 'No reporting structure yet'}
              description={query ? 'Try a different name or title.' : undefined}
            />
          ) : (
            nodes.map((node) => (
              <OrgNodeRow
                key={node.id}
                node={node}
                depth={0}
                expandedIds={effectiveExpanded}
                onToggle={toggle}
                locked={Boolean(query)}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function OrgNodeRow({
  node,
  depth,
  expandedIds,
  onToggle,
  locked,
}: {
  node: OrgNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  locked: boolean;
}) {
  const hasReports = node.reports.length > 0;
  const expanded = expandedIds.has(node.id);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg py-1.5 hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <button
          onClick={() => !locked && onToggle(node.id)}
          className="flex h-5 w-5 items-center justify-center text-slate-400 disabled:opacity-40"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          disabled={locked || !hasReports}
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
          {node.status !== 'active' ? (
            <Badge tone={statusTone(node.status)}>{titleCase(node.status)}</Badge>
          ) : null}
          {hasReports ? (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {node.reports.length}
            </span>
          ) : null}
        </Link>
      </div>
      {expanded && hasReports
        ? node.reports.map((child) => (
            <OrgNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              locked={locked}
            />
          ))
        : null}
    </div>
  );
}
