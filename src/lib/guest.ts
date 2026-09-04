import { cookies } from "next/headers";

/**
 * Guest Session：签发于服务端、带过期与限额的匿名会话标识。
 * V1 使用 httpOnly cookie；后续接入正式登录后同一字段由 auth 接管。
 */

export const GUEST_COOKIE = "sf_guest";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

function newGuestId(): string {
  return `g_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** 读取或创建 Guest Session（Server Component / Route Handler 中调用） */
export async function getOrCreateGuestSession(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && /^g_[a-f0-9]{32}$/.test(existing)) return existing;

  const id = newGuestId();
  store.set(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return id;
}

/** 只读获取（不签发），用于数据查询路径 */
export async function getGuestSession(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GUEST_COOKIE)?.value;
  return value && /^g_[a-f0-9]{32}$/.test(value) ? value : null;
}
