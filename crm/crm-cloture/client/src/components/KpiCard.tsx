import { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: "default" | "success" | "warning" | "danger" | "info";
  testId?: string;
  href?: string;
}

const ACCENTS = {
  default: "border-card-border",
  success: "border-emerald-200 dark:border-emerald-900",
  warning: "border-amber-200 dark:border-amber-900",
  danger: "border-rose-200 dark:border-rose-900",
  info: "border-cyan-200 dark:border-cyan-900",
};

export function KpiCard({ label, value, hint, icon, accent = "default", testId, href }: KpiCardProps) {
  const content = (
    <div
      data-testid={testId}
      className={cn(
        "relative rounded-lg border bg-card p-4 transition-all",
        ACCENTS[accent],
        href && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0"
      )}
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

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg">
        {content}
      </Link>
    );
  }
  return content;
}
