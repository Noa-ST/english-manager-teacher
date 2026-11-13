import { Suspense } from "react";
import { connection } from "next/server";

import { StudentPortalView } from "@/components/viewer/student-portal-view";
import { Skeleton } from "@/components/ui/feedback";
import { requireStudent } from "@/lib/auth";

async function StudentByIdGuard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const session = await requireStudent();
  const { id } = await params;
  return (
    <StudentPortalView
      session={session}
      initialStudentCode={decodeURIComponent(id)}
    />
  );
}

export default function StudentPortalByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      }
    >
      <StudentByIdGuard params={params} />
    </Suspense>
  );
}
