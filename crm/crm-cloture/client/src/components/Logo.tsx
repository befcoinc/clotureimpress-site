export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 36 36" fill="none" className="h-8 w-8" aria-label="ClôturePro logo">
        <rect x="1" y="1" width="34" height="34" rx="6" fill="hsl(var(--sidebar-primary))" />
        {/* fence pickets */}
        <path
          d="M7 11v16M12 11v16M17 11v16M22 11v16M27 11v16"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* horizontal rails */}
        <path d="M5 15h26M5 22h26" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
          ClôturePro
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-sidebar-foreground/60">
          CRM Canada
        </span>
      </div>
    </div>
  );
}
