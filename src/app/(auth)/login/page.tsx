"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await signIn("credentials", {
      redirect: false,
      email: email.trim().toLowerCase(),
      password
    });

    setLoading(false);

    if (result?.error) {
      setError(
        result.error === "CredentialsSignin"
          ? "Email veya şifre hatalı."
          : result.error
      );
      return;
    }

    router.push("/dashboard");
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          newPassword
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Şifre sıfırlanamadı.");
        return;
      }
      setSuccess("Şifre güncellendi. Yeni şifrenizle giriş yapabilirsiniz.");
      setForgotMode(false);
      setPassword("");
      setNewPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={forgotMode ? handleResetPassword : handleSubmit}
      className="space-y-4"
    >
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        {!forgotMode ? (
          <>
            <label className="label" htmlFor="password">
              Şifre
            </label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : (
          <>
            <label className="label" htmlFor="newPassword">
              Yeni şifre
            </label>
            <Input
              id="newPassword"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Button className="w-full" disabled={loading}>
        {forgotMode
          ? loading
            ? "Şifre güncelleniyor..."
            : "Şifreyi güncelle"
          : loading
            ? "Giriş yapılıyor..."
            : "Giriş yap"}
      </Button>

      <button
        type="button"
        className="w-full rounded-xl border border-white/10 bg-white/[0.02] py-2 text-xs text-slate-300 transition hover:bg-white/[0.06]"
        onClick={() => {
          setForgotMode((v) => !v);
          setError(null);
          setSuccess(null);
        }}
      >
        {forgotMode ? "Girişe geri dön" : "Şifremi unuttum"}
      </button>

      <p className="mt-2 text-center text-xs text-slate-400">
        İlk defa mı kullanıyorsun?{" "}
        <Link href="/register-store" className="text-indigo-300 hover:text-indigo-200">
          Mağaza oluştur
        </Link>
      </p>
    </form>
  );
}

