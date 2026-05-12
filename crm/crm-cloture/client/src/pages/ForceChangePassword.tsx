import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Eye, EyeOff } from "lucide-react";

export function ForceChangePassword() {
  const { user, logout } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: "Cloture2025!", newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors du changement de mot de passe.");
        setLoading(false);
        return;
      }
      // Reload to trigger /api/auth/me which will now return mustChangePassword: false
      window.location.reload();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    color: "#f5f0e8",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    padding: "0.8rem 2.8rem 0.8rem 1rem",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a0a",
      backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(201,163,90,0.06) 0%, transparent 70%)",
      padding: "1rem",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{
          background: "#111111",
          border: "1px solid rgba(201,163,90,0.2)",
          borderRadius: 12,
          padding: "3rem 2.5rem",
          color: "#f5f0e8",
        }}>
          <img
            src="https://clotureimpress.com/logo.png"
            alt="Clôture Impress"
            style={{ display: "block", margin: "0 auto 2rem", height: 60, width: "auto" }}
          />

          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "1.6rem",
            fontWeight: 400,
            textAlign: "center",
            marginBottom: "0.5rem",
            color: "#f5f0e8",
          }}>
            Créez votre mot de passe
          </h1>
          <div style={{ width: 36, height: 1, background: "#c9a35a", margin: "0 auto 1rem" }} />
          <p style={{ textAlign: "center", color: "#777", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
            Bonjour <strong style={{ color: "#f5f0e8" }}>{user?.name}</strong>
          </p>
          <p style={{ textAlign: "center", color: "#777", fontSize: "0.82rem", marginBottom: "2rem" }}>
            Pour continuer, choisissez un mot de passe personnel.
          </p>

          {error && (
            <div style={{
              background: "rgba(255,80,80,0.08)",
              border: "1px solid rgba(255,80,80,0.25)",
              borderRadius: 6,
              color: "#ff7070",
              fontSize: "0.85rem",
              padding: "0.75rem 1rem",
              marginBottom: "1.25rem",
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{
                display: "block", fontSize: "0.72rem", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "#777", marginBottom: "0.4rem",
              }}>
                Nouveau mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="8 caractères minimum"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = "#c9a35a"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1}
                  style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#777", padding: 0, display: "flex" }}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{
                display: "block", fontSize: "0.72rem", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "#777", marginBottom: "0.4rem",
              }}>
                Confirmer le mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = "#c9a35a"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                  style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#777", padding: 0, display: "flex" }}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? "rgba(201,163,90,0.5)" : "#c9a35a",
                color: "#0a0a0a",
                border: "none",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 700,
                fontFamily: "inherit",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "0.5rem",
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Enregistrement..." : "Enregistrer mon mot de passe"}
            </button>
          </form>

          <button
            onClick={logout}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              background: "none",
              border: "none",
              color: "#777",
              fontSize: "0.8rem",
              cursor: "pointer",
              marginTop: "1.75rem",
              fontFamily: "inherit",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#c9a35a")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#777")}
          >
            ← Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
