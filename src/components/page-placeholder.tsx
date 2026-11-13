import { Badge } from "@/components/ui/badge";

/** Placeholder block for scaffolded pages; remove as features land. */
export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        <Badge variant="secondary">{phase}</Badge>
      </div>
      <p className="max-w-2xl text-muted-foreground">{description}</p>
    </section>
  );
}
