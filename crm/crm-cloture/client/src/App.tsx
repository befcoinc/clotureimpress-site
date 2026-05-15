import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { RoleProvider } from "@/lib/role-context";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { AcceptInvite } from "@/pages/AcceptInvite";
import { ForceChangePassword } from "@/pages/ForceChangePassword";
import NotFound from "@/pages/not-found";
import { Dashboard } from "@/pages/Dashboard";
import { Leads } from "@/pages/Leads";
import { IntimuraBookmarklet } from "@/pages/IntimuraBookmarklet";
import { IntimuraReceive } from "@/pages/IntimuraReceive";
import { Intimura } from "@/pages/Intimura";
import { DispatchVendeur } from "@/pages/DispatchVendeur";
import { Soumissions } from "@/pages/Soumissions";
import { QuoteDetail } from "@/pages/QuoteDetail";
import { DispatchInstallation } from "@/pages/DispatchInstallation";
import { CalendrierPartage } from "@/pages/CalendrierPartage";
import { TableauVentes } from "@/pages/TableauVentes";
import { TableauInstallation } from "@/pages/TableauInstallation";
import { Secteurs } from "@/pages/Secteurs";
import { Heatmap } from "@/pages/Heatmap";
import { Utilisateurs } from "@/pages/Utilisateurs";
import { Architecture } from "@/pages/Architecture";
import { LanguageProvider, useLanguage } from "@/lib/language-context";
import { InstallerOnboarding } from "@/pages/InstallerOnboarding";
import { ApplicationsInstallateurs } from "@/pages/ApplicationsInstallateurs";
import { ApplicationsRepresentants } from "@/pages/ApplicationsRepresentants";
import { AlertesDormantes } from "@/pages/AlertesDormantes";
import { Analytics } from "@/pages/Analytics";

function AppRouter({ canViewAdmin, isInstaller }: { canViewAdmin: boolean; isInstaller: boolean }) {

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/login" component={Dashboard} />
        <Route path="/leads-impress" component={Leads} />
        <Route path="/leads" component={Leads} />
        <Route path="/intimura-bookmarklet" component={IntimuraBookmarklet} />
        <Route path="/intimura-receive" component={IntimuraReceive} />
        <Route path="/intimura" component={Intimura} />
        <Route path="/dispatch-vendeur" component={DispatchVendeur} />
        <Route path="/alertes-dormantes" component={AlertesDormantes} />
        <Route path="/soumissions" component={Soumissions} />
        <Route path="/soumissions/:id" component={QuoteDetail} />
        <Route path="/calendrier" component={CalendrierPartage} />
        <Route path="/dispatch-installation" component={DispatchInstallation} />
        <Route path="/ma-fiche-sous-traitant" component={isInstaller ? InstallerOnboarding : NotFound} />
        <Route path="/heatmap" component={Heatmap} />
        <Route path="/tableau-ventes" component={TableauVentes} />
        <Route path="/tableau-installation" component={TableauInstallation} />
        <Route path="/secteurs" component={Secteurs} />
        <Route path="/utilisateurs" component={canViewAdmin ? Utilisateurs : NotFound} />
        <Route path="/applications-installateurs" component={canViewAdmin ? ApplicationsInstallateurs : NotFound} />
        <Route path="/applications-representants" component={canViewAdmin ? ApplicationsRepresentants : NotFound} />
        <Route path="/architecture" component={canViewAdmin ? Architecture : NotFound} />
        <Route path="/analytics" component={canViewAdmin ? Analytics : NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppWithAuth() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  // Accept-invite page is accessible without login
  if (window.location.hash.startsWith("#/accept-invite")) {
    return <AcceptInvite />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        {t("layout.loading")}
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if ((user as any).mustChangePassword) {
    return <ForceChangePassword />;
  }

  if ((user as any).role === "installer" && (user as any).installerProfileCompleted === false) {
    return <InstallerOnboarding />;
  }

  const canViewAdmin = ["admin", "sales_director", "install_director"].includes((user as any).role);
  const isInstaller = (user as any).role === "installer";

  return (
    <RoleProvider initialUser={user}>
      <Router hook={useHashLocation}>
        <AppRouter canViewAdmin={canViewAdmin} isInstaller={isInstaller} />
      </Router>
    </RoleProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <LanguageProvider>
          <AuthProvider>
            <AppWithAuth />
          </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
