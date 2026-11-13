import { Suspense } from "react";
import { connection } from "next/server";

import { StudentPortalView } from "@/components/viewer/student-portal-view";
import { Skeleton } from "@/components/ui/feedback";
import { requireStudent } from "@/lib/auth";

async function Guard() {
  await connection();
  const session = await requireStudent();
  return <StudentPortalView session={session} initialSection="profile" />;
}

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10"><Skeleton className="h-72 w-full rounded-2xl" /></div>}>
      <Guard />
    </Suspense>
  );
}

