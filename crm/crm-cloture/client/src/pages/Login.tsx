import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Eye, EyeOff } from "lucide-react";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("cloturecrm:remembered-email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (rememberEmail) {
        window.localStorage.setItem("cloturecrm:remembered-email", email.trim());
      } else {
        window.localStorage.removeItem("cloturecrm:remembered-email");
      }
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
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
          {/* Logo */}
          <img
            src="https://clotureimpress.com/logo.png"
            alt="Clôture Impress"
            style={{ display: "block", margin: "0 auto 2rem", height: 60, width: "auto" }}
          />

          {/* Title */}
          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "1.8rem",
            fontWeight: 400,
            textAlign: "center",
            marginBottom: "0.5rem",
            color: "#f5f0e8",
          }}>
            Espace équipe
          </h1>
          <div style={{ width: 36, height: 1, background: "#c9a35a", margin: "0 auto 1.5rem" }} />
          <p style={{ textAlign: "center", color: "#777", fontSize: "0.82rem", marginBottom: "2rem" }}>
            Accès réservé au personnel autorisé
          </p>

          {/* Error */}
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

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{
                display: "block",
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#777",
                marginBottom: "0.4rem",
              }}>
                Courriel
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="nom@clotureimpress.com"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "#f5f0e8",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  padding: "0.8rem 1rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => e.target.style.borderColor = "#c9a35a"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{
                display: "block",
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#777",
                marginBottom: "0.4rem",
              }}>
                Mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    color: "#f5f0e8",
                    fontSize: "0.95rem",
                    fontFamily: "inherit",
                    padding: "0.8rem 2.8rem 0.8rem 1rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#c9a35a"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  style={{
                    position: "absolute",
                    right: "0.8rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#777",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              color: "#bbb",
              fontSize: "0.86rem",
              marginBottom: "1.25rem",
              cursor: "pointer",
              userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#c9a35a" }}
              />
              Mémoriser mon courriel sur cet appareil
            </label>

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
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          {/* Back link */}
          <a
            href="https://clotureimpress.com"
            style={{
              display: "block",
              textAlign: "center",
              color: "#777",
              fontSize: "0.8rem",
              textDecoration: "none",
              marginTop: "1.75rem",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#c9a35a")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#777")}
          >
            ← Retour au site
          </a>
        </div>
      </div>
    </div>
  );
}
