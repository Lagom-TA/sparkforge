"use client";

import { useRouter } from "next/navigation";

/** 退出登录（清除 Supabase auth cookie 并刷新服务端状态）。 */
export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const { getSupabaseBrowser } = await import("@/lib/supabase/server");
        const supabase = getSupabaseBrowser();
        await supabase?.auth.signOut();
        router.refresh();
      }}
      className="text-xs text-neutral-400 underline"
    >
      退出
    </button>
  );
}
