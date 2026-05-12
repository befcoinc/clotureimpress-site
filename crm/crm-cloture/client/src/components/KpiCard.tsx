import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: "default" | "success" | "warning" | "danger" | "info";
  testId?: string;
}

const ACCENTS = {
  default: "border-card-border",
  success: "border-emerald-200 dark:border-emerald-900",
  warning: "border-amber-200 dark:border-amber-900",
  danger: "border-rose-200 dark:border-rose-900",
  info: "border-cyan-200 dark:border-cyan-900",
};

export function KpiCard({ label, value, hint, icon, accent = "default", testId }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      className={cn("relative rounded-lg border bg-card p-4", ACCENTS[accent])}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </div>
          <div className="mt-2 text-[26px] leading-none font-bold tabular tracking-tight">
            {value}
          </div>
          {hint && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>
          )}
        </div>
        {icon && (
          <div className="shrink-0 rounded-md bg-accent text-accent-foreground p-2">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
