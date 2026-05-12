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
import NotFound from "@/pages/not-found";
import { Dashboard } from "@/pages/Dashboard";
import { Leads } from "@/pages/Leads";
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

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/intimura" component={Intimura} />
        <Route path="/dispatch-vendeur" component={DispatchVendeur} />
        <Route path="/soumissions" component={Soumissions} />
        <Route path="/soumissions/:id" component={QuoteDetail} />
        <Route path="/calendrier" component={CalendrierPartage} />
        <Route path="/dispatch-installation" component={DispatchInstallation} />
        <Route path="/heatmap" component={Heatmap} />
        <Route path="/tableau-ventes" component={TableauVentes} />
        <Route path="/tableau-installation" component={TableauInstallation} />
        <Route path="/secteurs" component={Secteurs} />
        <Route path="/utilisateurs" component={Utilisateurs} />
        <Route path="/architecture" component={Architecture} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppWithAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <RoleProvider initialUser={user}>
      <Router hook={useHashLocation}>
        <AppRouter />
      </Router>
    </RoleProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <AppWithAuth />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

