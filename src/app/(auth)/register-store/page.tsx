"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type ApiResponse =
  | {
      success: true;
      storeId: string;
      storeSlug: string;
      userId: string;
      membershipId: string;
    }
  | { success: false; error: string };

export default function RegisterStorePage() {
  const router = useRouter();

  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("");
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const computedSlug = useMemo(() => {
    const src = (storeSlug || storeName).trim().toLowerCase();
    return src
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }, [storeName, storeSlug]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          storeSlug: computedSlug,
          ownerName,
          email,
          password,
          phone,
          currency,
          locale,
          timezone
        })
      });

      const data = (await safeParseJsonResponse(res)) as ApiResponse | null;
      if (!res.ok || !data || data.success !== true) {
        throw new Error((data as any)?.error ?? "Mağaza oluşturulamadı.");
      }

      const login = await signIn("credentials", {
        redirect: false,
        email,
        password
      });
      if (login?.error) {
        router.push("/login");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mağaza oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mağaza Oluştur</h1>
        <p className="mt-1 text-sm text-slate-400">
          İlk mağazanızı oluşturun ve owner hesabınızla giriş yapın.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="storeName">
            Mağaza adı
          </label>
          <input
            id="storeName"
            className="input"
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Örn: Maprithm Ticaret"
          />
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="storeSlug">
            Mağaza slug
          </label>
          <input
            id="storeSlug"
            className="input"
            value={storeSlug}
            onChange={(e) => setStoreSlug(e.target.value)}
            placeholder={`Örn: ${computedSlug || "maprithm-ticaret"}`}
          />
          <div className="mt-1 text-xs text-slate-500">
            Kullanılacak slug: <span className="text-slate-300">{computedSlug || "—"}</span>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="ownerName">
            Mağaza sahibi adı soyadı
          </label>
          <input
            id="ownerName"
            className="input"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Örn: Hakan Yılmaz"
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            E-posta
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@domain.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Şifre
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="phone">
            Telefon (opsiyonel)
          </label>
          <input
            id="phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+90..."
          />
          <div className="mt-1 text-xs text-slate-500">
            Not: Telefon alanı şimdilik veritabanına kaydedilmez.
          </div>
        </div>

        <div>
          <label className="label" htmlFor="currency">
            Para birimi (opsiyonel)
          </label>
          <input
            id="currency"
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="TRY"
          />
        </div>
        <div>
          <label className="label" htmlFor="locale">
            Locale (opsiyonel)
          </label>
          <input
            id="locale"
            className="input"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            placeholder="tr-TR"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="timezone">
            Timezone (opsiyonel)
          </label>
          <input
            id="timezone"
            className="input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Istanbul"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn-primary w-full" disabled={loading}>
        {loading ? "Oluşturuluyor..." : "Mağazayı oluştur ve giriş yap"}
      </button>

      <p className="mt-2 text-center text-xs text-slate-400">
        Zaten hesabın var mı?{" "}
        <Link href="/login" className="text-indigo-400 hover:underline">
          Giriş yap
        </Link>
      </p>
    </form>
  );
}

