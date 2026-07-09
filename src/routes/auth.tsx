import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Activity, Loader2 } from "lucide-react";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Sign in — Precision Edge" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: redirect ?? "/app/dashboard" });
    });
  }, [navigate, redirect]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: redirect ?? "/app/dashboard" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) { toast.error("Google sign-in failed"); setLoading(false); return; }
    if (result.redirected) return;
    navigate({ to: redirect ?? "/app/dashboard" });
  };

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-[var(--neon)] to-[var(--accent)] flex items-center justify-center">
            <Activity size={18} className="text-[var(--primary-foreground)]" />
          </div>
          <div>
            <div className="text-base font-bold tracking-wide neon-text">PRECISION <span className="text-[var(--accent)]">EDGE</span></div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">AI Trading Platform</div>
          </div>
        </Link>

        <div className="glass rounded-lg p-6 space-y-5">
          <div className="flex gap-1 rounded-md border border-border/60 bg-secondary/30 p-1">
            <button onClick={() => setMode("signin")} className={`flex-1 py-1.5 rounded text-xs uppercase tracking-wider ${mode === "signin" ? "bg-[var(--neon)]/20 text-[var(--neon)]" : "text-muted-foreground"}`}>Sign in</button>
            <button onClick={() => setMode("signup")} className={`flex-1 py-1.5 rounded text-xs uppercase tracking-wider ${mode === "signup" ? "bg-[var(--neon)]/20 text-[var(--neon)]" : "text-muted-foreground"}`}>Sign up</button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-md bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-[var(--neon)]" />
            )}
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-md bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-[var(--neon)]" />
            <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 px-3 rounded-md bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-[var(--neon)]" />
            <button disabled={loading} type="submit" className="w-full h-10 rounded-md bg-[var(--neon)]/20 hover:bg-[var(--neon)]/30 border border-[var(--neon)]/50 text-sm font-semibold text-[var(--neon)] flex items-center justify-center gap-2 disabled:opacity-50">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <div className="flex-1 h-px bg-border/60" /> or <div className="flex-1 h-px bg-border/60" />
          </div>

          <button onClick={google} disabled={loading} className="w-full h-10 rounded-md bg-secondary/40 hover:bg-secondary/60 border border-border/60 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.16-4.54H2.18v2.85A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09a6.62 6.62 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.85z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15A11 11 0 0 0 12 1a11 11 0 0 0-9.82 6.07l3.66 2.85C6.7 7.32 9.13 5.38 12 5.38z"/></svg>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
