import Link from "next/link";

import { ADMIN_NAV } from "@/lib/routes";

export function AdminSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4 font-heading font-semibold">
        Teacher Dashboard
      </div>
      <nav aria-label="Quản trị" className="flex flex-col gap-1 p-3">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

