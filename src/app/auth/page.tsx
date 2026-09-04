"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 邮箱登录（Supabase OTP）：验证码方式，不依赖外链回调，
 * 评委流程最短。Guest 数据在登录后仍可访问（归属按 owner_id 并行保留）。
 */
export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getBrowser() {
    const { getSupabaseBrowser } = await import("@/lib/supabase/server");
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("登录功能未配置（缺少 NEXT_PUBLIC_SUPABASE_ANON_KEY）。");
      return null;
    }
    return supabase;
  }

  async function sendCode() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    const supabase = await getBrowser();
    if (!supabase) return setBusy(false);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  async function verify() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const supabase = await getBrowser();
    if (!supabase) return setBusy(false);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-6 flex items-center justify-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-black text-white">S</span>
        <span className="text-sm font-semibold tracking-wide">SparkForge</span>
      </div>
      <h1 className="text-2xl font-bold">登录以同步项目</h1>
      <p className="mt-2 text-sm text-neutral-600">
        使用邮箱验证码登录。Guest 期间创建的项目仍保留在本设备。
      </p>

      {!sent ? (
        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm placeholder:text-faint"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={sendCode}
            disabled={!email.trim() || busy}
            className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? "发送中…" : "发送验证码"}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-neutral-600">验证码已发送到 {email}</p>
          <input
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm placeholder:text-faint tracking-widest"
            placeholder="6 位验证码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
          <button
            onClick={verify}
            disabled={!code.trim() || busy}
            className="btn-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? "验证中…" : "登录"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <a href="/" className="mt-6 block text-center text-xs text-faint underline underline-offset-2 hover:text-muted">
        暂不登录，返回首页
      </a>
    </main>
  );
}
