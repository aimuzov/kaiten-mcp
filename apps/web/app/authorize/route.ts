import { NextResponse } from "next/server";
import { sealToken } from "@kaiten-mcp/core";
import { getAuthSecret, getConfiguredKaitenUrl, isAllowedRedirectUri } from "../../lib/baseUrl";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function badRequest(msg: string) {
  return new NextResponse(`Bad request: ${msg}`, { status: 400 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  if (p.get("response_type") !== "code") return badRequest("response_type должен быть 'code'");
  const redirectUri = p.get("redirect_uri");
  const codeChallenge = p.get("code_challenge");
  const state = p.get("state") ?? "";
  if (!redirectUri) return badRequest("нет redirect_uri");
  if (!isAllowedRedirectUri(redirectUri)) return badRequest("redirect_uri не разрешён");
  if (!codeChallenge || p.get("code_challenge_method") !== "S256") return badRequest("нужен code_challenge с методом S256");

  const needUrl = !getConfiguredKaitenUrl();
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Подключение Kaiten</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px">
<h1>Подключение к Kaiten</h1>
<p>Введите ваш персональный Kaiten API-токен. Он будет использоваться только для ваших запросов и хранится в зашифрованном виде в токене доступа.</p>
<form method="POST" action="/authorize">
  ${needUrl ? `<p><label>Kaiten URL<br><input name="kaiten_url" required placeholder="https://your-domain.kaiten.ru" style="width:100%;padding:8px"></label></p>` : ""}
  <p><label>Kaiten API-токен<br><input name="kaiten_token" required type="password" style="width:100%;padding:8px"></label></p>
  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
  <input type="hidden" name="state" value="${escapeHtml(state)}">
  <button type="submit" style="padding:10px 16px">Подключить</button>
</form>
</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const kaitenToken = String(form.get("kaiten_token") ?? "").trim();
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const kaitenUrl = (getConfiguredKaitenUrl() ?? String(form.get("kaiten_url") ?? "").trim()) || undefined;

  if (!kaitenToken) return new NextResponse("Не указан Kaiten токен", { status: 400 });
  if (!redirectUri || !codeChallenge) return new NextResponse("Битый запрос авторизации", { status: 400 });
  if (!isAllowedRedirectUri(redirectUri)) return new NextResponse("redirect_uri не разрешён", { status: 400 });

  const code = await sealToken(
    { kind: "code", kaitenToken, kaitenUrl, code_challenge: codeChallenge, redirect_uri: redirectUri },
    getAuthSecret(),
    "5m"
  );

  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest.toString(), { status: 302 });
}
