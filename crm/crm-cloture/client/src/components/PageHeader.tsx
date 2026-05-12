import { ReactNode } from "react";
import { useRole } from "@/lib/role-context";
import { useLanguage } from "@/lib/language-context";
import { ROLES } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  const { currentUser, role } = useRole();
  const { language } = useLanguage();
  const isEn = language === "en";

  const roleLabelsEn: Record<string, string> = {
    admin: "Admin",
    sales_director: "Sales Director",
    install_director: "Installation Director",
    sales_rep: "Sales Rep",
    installer: "Installer",
  };

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur">
      <div className="px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.14em] font-semibold">
              {currentUser?.name || (isEn ? "Guest" : "Invité")} · {isEn ? (roleLabelsEn[role] || ROLES[role]) : ROLES[role]}
            </Badge>
          </div>
          <h1 data-testid="text-page-title" className="text-xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">{description}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </div>
    </div>
  );
}
