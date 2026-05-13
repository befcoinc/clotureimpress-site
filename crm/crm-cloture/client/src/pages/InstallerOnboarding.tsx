import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InstallerOnboarding() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function markCompleted() {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/installer-profile-complete", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Impossible de confirmer la fiche.");
        setIsSubmitting(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Erreur reseau. Reessaie.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Fiche sous-traitant obligatoire</CardTitle>
            <CardDescription>
              Complete ou mets a jour la fiche ci-dessous pour gerer ton profil installateur depuis le CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <iframe
                src="/installer-sous-traitant-form"
                title="Fiche sous-traitant"
                className="h-[72vh] w-full"
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={markCompleted} disabled={isSubmitting} data-testid="button-confirm-installer-form">
                {isSubmitting ? "Validation..." : "J'ai complete / mis a jour la fiche"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
