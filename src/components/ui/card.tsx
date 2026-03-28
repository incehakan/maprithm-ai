import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_80px_-32px_rgba(15,23,42,0.9)] backdrop-blur-xl",
        className
      )}
      {...props}
    />
  );
}

