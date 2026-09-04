import { getSupabaseAuth } from "@/lib/supabase/ssr";

/**
 * 当前访问主体：登录用户优先，否则 Guest Session。
 * 数据归属一律以服务端解析结果为准，客户端不能提交并信任 owner_id。
 */

export interface Principal {
  userId: string | null;
  guestSessionId: string | null;
  email: string | null;
}

export async function getPrincipal(): Promise<Principal> {
  const auth = await getSupabaseAuth();
  if (auth) {
    const { data } = await auth.auth.getUser();
    if (data?.user) {
      return {
        userId: data.user.id,
        guestSessionId: null,
        email: data.user.email ?? null,
      };
    }
  }
  const { getGuestSession } = await import("@/lib/guest");
  const guest = await getGuestSession();
  return { userId: null, guestSessionId: guest, email: null };
}
