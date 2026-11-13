import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary/45 text-secondary-foreground border-secondary/70",
        warm: "bg-warm text-warm-foreground border-[#E4D8BA]",
        gold: "bg-[#FBF5E6] text-[#7A5915] border-[#D9AE54]/60 font-semibold",
        highlight: "bg-highlight/20 text-[#8F3F28] border-highlight/50",
        success: "bg-emerald-50/90 text-emerald-800 border-emerald-200/80",
        warning: "bg-amber-50/90 text-amber-900 border-amber-200/80",
        info: "bg-accent text-accent-foreground border-[#D5E0F2]",
        destructive: "bg-red-50 text-red-700 border-red-200",
        outline: "border-border bg-card text-foreground",
        ghost: "hover:bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
