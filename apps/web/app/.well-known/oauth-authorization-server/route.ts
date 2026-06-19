import { NextResponse } from 'next/server'
import { getBaseUrl } from '../../../lib/baseUrl'

export async function GET() {
	const base = await getBaseUrl()
	return NextResponse.json({
		issuer: base,
		authorization_endpoint: `${base}/authorize`,
		token_endpoint: `${base}/token`,
		registration_endpoint: `${base}/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
	})
}
