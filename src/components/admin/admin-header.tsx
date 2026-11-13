import Link from "next/link";

import { Button } from "@/components/ui/button";

export function AdminHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <span className="font-heading text-sm font-semibold md:hidden">Teacher Dashboard</span>
        <span className="hidden text-sm text-muted-foreground md:inline">
          Khu vực quản trị giáo viên
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button render={<Link href="/" />} variant="outline" size="sm">
          Xem cổng học sinh
        </Button>
      </div>
    </header>
  );
}

