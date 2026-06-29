import type { HrDocument } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, PenLine } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const qc = useQueryClient();
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<HrDocument[]>('/documents'),
  });

  const sign = useMutation({
    mutationFn: (id: string) => api.post(`/documents/${id}/sign`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader title="Documents" description="Access company and personal documents." />

      <Card>
        <CardHeader title="My documents" />
        <CardBody className="p-0">
          {documents.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={FileText} title="No documents" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Size</TH>
                  <TH>Uploaded</TH>
                  <TH>Signature</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {documents.map((doc) => (
                  <TR key={doc.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{doc.name}</span>
                      </div>
                    </TD>
                    <TD>{doc.category}</TD>
                    <TD>{formatBytes(doc.sizeBytes)}</TD>
                    <TD>{formatDate(doc.createdAt)}</TD>
                    <TD>
                      {!doc.requiresSignature ? (
                        <span className="text-xs text-slate-400">Not required</span>
                      ) : doc.signedAt ? (
                        <Badge tone="success">Signed</Badge>
                      ) : (
                        <Badge tone="warning">Pending</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      {doc.requiresSignature && !doc.signedAt ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<PenLine className="h-4 w-4" />}
                          loading={sign.isPending}
                          onClick={() => sign.mutate(doc.id)}
                        >
                          Sign
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
