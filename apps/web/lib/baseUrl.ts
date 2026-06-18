import { headers } from "next/headers";

/** Публичный базовый URL сервиса (для OAuth metadata и redirect-проверок). */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Не удалось определить host из заголовков");
  return `${proto}://${host}`;
}

/** Секрет шифрования токенов. */
export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET не задан или слишком короткий (минимум 16 символов)");
  return s;
}

/** Опциональный единый Kaiten URL (если у всех один домен). */
export function getConfiguredKaitenUrl(): string | undefined {
  return process.env.KAITEN_API_URL?.trim() || undefined;
}
