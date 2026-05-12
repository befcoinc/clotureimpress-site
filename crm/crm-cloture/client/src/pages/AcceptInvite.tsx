import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/lib/language-context";

const ROLE_LABELS_FR: Record<string, string> = {
  admin: "Administrateur",
  sales_director: "Directeur/trice des ventes",
  install_director: "Directeur des installations",
  sales_rep: "Vendeur / Représentant",
  installer: "Installateur / Sous-traitant",
};

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Administrator",
  sales_director: "Sales Director",
  install_director: "Installation Director",
  sales_rep: "Sales Rep",
  installer: "Installer / Subcontractor",
};

type InviteInfo = { name: string; email: string; role: string };
type PageState = "loading" | "invalid" | "ready" | "submitting" | "done" | "error";

function getToken() {
  const hash = window.location.hash; // e.g. #/accept-invite?token=abc123
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  return params.get("token");
}

export function AcceptInvite() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const token = getToken();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }
    fetch(`/api/auth/invite/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: InviteInfo) => { setInfo(data); setPageState("ready"); })
      .catch(() => setPageState("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setErrorMsg(isEn ? "Password must contain at least 6 characters." : "Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setErrorMsg(isEn ? "Passwords do not match." : "Les mots de passe ne correspondent pas."); return; }
    setErrorMsg("");
    setPageState("submitting");
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || (isEn ? "An error occurred." : "Une erreur s'est produite.")); setPageState("ready"); return; }
      setPageState("done");
      // Redirect to CRM after short delay
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch {
      setErrorMsg(isEn ? "Network error. Try again." : "Erreur réseau. Réessaie.");
      setPageState("ready");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10" />
            <div>
              <div className="font-bold text-lg leading-none text-teal-700">ClôturePro</div>
              <div className="text-xs text-slate-500 leading-none mt-0.5">CRM Canada</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <h1 className="text-xl font-semibold text-slate-900">{isEn ? "Create your password" : "Crée ton mot de passe"}</h1>
            <p className="mt-1 text-sm text-slate-500">{isEn ? "Finish creating your CRM account" : "Finalise la création de ton compte CRM"}</p>
          </div>

          <div className="px-8 py-6">
            {pageState === "loading" && (
              <p className="text-sm text-slate-500 text-center py-4">{isEn ? "Checking link..." : "Vérification du lien…"}</p>
            )}

            {pageState === "invalid" && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {isEn ? "This link is invalid or expired. Ask your administrator to send a new invite." : "Ce lien est invalide ou a expiré. Demande à ton administrateur de te renvoyer une invitation."}
              </div>
            )}

            {pageState === "done" && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700 text-center">
                {isEn ? "Password created! Redirecting to CRM..." : "✅ Mot de passe créé ! Redirection vers le CRM…"}
              </div>
            )}

            {(pageState === "ready" || pageState === "submitting" || pageState === "error") && info && (
              <>
                {/* Account info (read-only) */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{isEn ? "Your account" : "Ton compte"}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{isEn ? "Name" : "Nom"}</span>
                      <span className="font-medium text-slate-800">{info.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{isEn ? "Email" : "Courriel"}</span>
                      <span className="font-medium text-slate-800">{info.email}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{isEn ? "Role" : "Rôle"}</span>
                      <span className="font-medium text-teal-700">{(isEn ? ROLE_LABELS_EN : ROLE_LABELS_FR)[info.role] ?? info.role}</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      {isEn ? "New password" : "Nouveau mot de passe"}
                    </label>
                    <div className="relative">
                      <input
                        type={showPwd ? "text" : "password"}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isEn ? "At least 6 characters" : "Au moins 6 caractères"}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showPwd ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      {isEn ? "Confirm password" : "Confirmer le mot de passe"}
                    </label>
                    <input
                      type={showPwd ? "text" : "password"}
                      required
                      minLength={6}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder={isEn ? "Repeat password" : "Répète le mot de passe"}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  {errorMsg && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pageState === "submitting"}
                    className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
                  >
                    {pageState === "submitting" ? (isEn ? "Creating..." : "Création…") : (isEn ? "Create my account ->" : "Créer mon compte →")}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
