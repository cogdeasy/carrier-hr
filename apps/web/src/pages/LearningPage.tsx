import type { Course, CourseEnrollment } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { titleCase } from '../lib/format';

export function LearningPage() {
  const qc = useQueryClient();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['learning', 'courses'],
    queryFn: () => api.get<Course[]>('/learning/courses'),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['learning', 'enrollments'],
    queryFn: () => api.get<CourseEnrollment[]>('/learning/enrollments'),
  });

  const enroll = useMutation({
    mutationFn: (courseId: string) => api.post('/learning/enrollments', { courseId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['learning'] });
    },
  });

  const updateProgress = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      api.patch(`/learning/enrollments/${id}`, { progress }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['learning', 'enrollments'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  const enrollmentByCourse = new Map(enrollments.map((e) => [e.courseId, e]));

  return (
    <div>
      <PageHeader title="Learning & Development" description="Grow your skills with curated courses." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => {
          const enrollment = enrollmentByCourse.get(course.id);
          return (
            <Card key={course.id}>
              <CardHeader
                title={course.title}
                subtitle={`${course.provider} · ${Math.round(course.durationMinutes / 60)}h`}
                action={
                  course.required ? <Badge tone="warning">Required</Badge> : <Badge>Elective</Badge>
                }
              />
              <CardBody>
                <p className="text-sm text-slate-600">{course.description}</p>
                {enrollment ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <Badge tone={statusTone(enrollment.status)}>{titleCase(enrollment.status)}</Badge>
                      <span>{enrollment.progress}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-carrier-600"
                        style={{ width: `${enrollment.progress}%` }}
                      />
                    </div>
                    {enrollment.status !== 'completed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        loading={updateProgress.isPending}
                        onClick={() =>
                          updateProgress.mutate({
                            id: enrollment.id,
                            progress: Math.min(100, enrollment.progress + 25),
                          })
                        }
                      >
                        Continue
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="mt-4 w-full"
                    leftIcon={<GraduationCap className="h-4 w-4" />}
                    loading={enroll.isPending}
                    onClick={() => enroll.mutate(course.id)}
                  >
                    Enroll
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
