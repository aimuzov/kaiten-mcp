/**
 * Поднимает `next start` (после build), затем:
 * register -> authorize(POST) -> token -> MCP initialize + tools/list (Bearer) -> вызов инструмента.
 * Ожидаем: tools/list непустой; вызов инструмента доходит до Kaiten (401 с фейк-токеном).
 */
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const BASE = 'http://localhost:3000'
const b64url = (b: Buffer) =>
	b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function main() {
	const verifier = b64url(randomBytes(32))
	const challenge = b64url(createHash('sha256').update(verifier).digest())
	const redirectUri = 'https://claude.ai/api/mcp/auth_callback'

	// 1) register
	const reg = (await (
		await fetch(`${BASE}/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ redirect_uris: [redirectUri] }),
		})
	).json()) as { client_id?: string }
	if (!reg.client_id) throw new Error('register: нет client_id')

	// 2) authorize POST (имитируем сабмит формы)
	const authBody = new URLSearchParams({
		kaiten_token: 'dummy-token',
		kaiten_url: 'https://example.kaiten.ru',
		redirect_uri: redirectUri,
		code_challenge: challenge,
		state: 's1',
	})
	const authRes = await fetch(`${BASE}/authorize`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: authBody,
		redirect: 'manual',
	})
	const loc = authRes.headers.get('location')
	if (!loc) throw new Error(`authorize: нет redirect Location (статус ${authRes.status})`)
	const code = new URL(loc).searchParams.get('code')
	if (!code) throw new Error('authorize: нет code в location')

	// 3) token
	const tokenBody = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		code_verifier: verifier,
		redirect_uri: redirectUri,
	})
	const tokRes = await fetch(`${BASE}/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: tokenBody,
	})
	const tok = (await tokRes.json()) as { access_token?: string; error?: string }
	if (!tok.access_token) throw new Error(`token: нет access_token (${JSON.stringify(tok)})`)

	// 4) MCP по Streamable HTTP с Bearer
	const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
		requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } },
	})
	const client = new Client({ name: 'flow-test', version: '0.0.0' })
	await client.connect(transport)
	const { tools } = await client.listTools()
	if (tools.length < 30) throw new Error(`tools/list вернул мало инструментов: ${tools.length}`)

	// 5) вызов инструмента — дойдёт до Kaiten (401 ожидаем)
	const res = await client.callTool({ name: 'kaiten_get_current_user', arguments: {} })
	await client.close()

	process.stdout.write(
		`OK: flow пройден. Инструментов: ${tools.length}. Вызов инструмента вернулся (isError=${(res as { isError?: boolean }).isError ?? false}).\n`,
	)
}

main().catch((e) => {
	process.stderr.write(`flow-test упал: ${e?.stack ?? e}\n`)
	process.exit(1)
})
