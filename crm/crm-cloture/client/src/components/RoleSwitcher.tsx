import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import type { User } from "@shared/schema";
import { ROLES } from "@shared/schema";

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { currentUser, setCurrentUser } = useRole();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  return (
    <Select
      value={currentUser?.id?.toString() || ""}
      onValueChange={(val) => {
        const u = users.find((x) => x.id === Number(val));
        if (u) setCurrentUser(u);
      }}
    >
      <SelectTrigger
        data-testid="select-role"
        className={
          compact
            ? "w-[180px] bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            : "w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover-elevate"
        }
      >
        <SelectValue placeholder="Choisir un utilisateur" />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id.toString()} data-testid={`role-option-${u.id}`}>
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">{u.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {ROLES[u.role as keyof typeof ROLES]}
                {u.region ? ` · ${u.region}` : ""}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
