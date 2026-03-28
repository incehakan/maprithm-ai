import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-xl border px-4 py-3 text-sm backdrop-blur",
  {
    variants: {
      variant: {
        success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        error: "border-rose-400/30 bg-rose-400/10 text-rose-100",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-100",
        info: "border-indigo-400/30 bg-indigo-400/10 text-indigo-100"
      }
    },
    defaultVariants: {
      variant: "info"
    }
  }
);

export function Alert({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

