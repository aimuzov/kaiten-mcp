import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

export async function POST(req: Request) {
	const body = await req.json().catch(() => ({}))
	const clientId = `kaiten-mcp-${randomUUID()}`
	return NextResponse.json(
		{
			client_id: clientId,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			redirect_uris: Array.isArray(body?.redirect_uris) ? body.redirect_uris : [],
		},
		{ status: 201 },
	)
}
