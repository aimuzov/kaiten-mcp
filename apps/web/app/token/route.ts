import { NextResponse } from 'next/server'
import { sealToken, openToken, verifyPkceS256 } from '@aimuzov/kaiten-mcp-core'
import { getAuthSecret } from '../../lib/baseUrl'

const ACCESS_TTL = '12h'
const REFRESH_TTL = '30d'

function err(error: string, status = 400) {
	return NextResponse.json({ error }, { status })
}

export async function POST(req: Request) {
	const secret = getAuthSecret()
	const form = await req.formData()
	const grantType = String(form.get('grant_type') ?? '')

	if (grantType === 'authorization_code') {
		const code = String(form.get('code') ?? '')
		const verifier = String(form.get('code_verifier') ?? '')
		const redirectUri = String(form.get('redirect_uri') ?? '')
		if (!code || !verifier) return err('invalid_request')

		let payload
		try {
			payload = await openToken(code, secret)
		} catch {
			return err('invalid_grant')
		}
		if (payload.kind !== 'code') return err('invalid_grant')
		if (payload.redirect_uri && payload.redirect_uri !== redirectUri) return err('invalid_grant')
		if (!payload.code_challenge || !verifyPkceS256(verifier, payload.code_challenge))
			return err('invalid_grant')

		const claims = { kaitenToken: payload.kaitenToken, kaitenUrl: payload.kaitenUrl }
		const access_token = await sealToken({ ...claims, kind: 'access' }, secret, ACCESS_TTL)
		const refresh_token = await sealToken({ ...claims, kind: 'refresh' }, secret, REFRESH_TTL)
		return NextResponse.json({
			access_token,
			refresh_token,
			token_type: 'Bearer',
			expires_in: 12 * 3600,
		})
	}

	if (grantType === 'refresh_token') {
		const refresh = String(form.get('refresh_token') ?? '')
		let payload
		try {
			payload = await openToken(refresh, secret)
		} catch {
			return err('invalid_grant')
		}
		if (payload.kind !== 'refresh') return err('invalid_grant')
		const claims = { kaitenToken: payload.kaitenToken, kaitenUrl: payload.kaitenUrl }
		const access_token = await sealToken({ ...claims, kind: 'access' }, secret, ACCESS_TTL)
		return NextResponse.json({ access_token, token_type: 'Bearer', expires_in: 12 * 3600 })
	}

	return err('unsupported_grant_type')
}
