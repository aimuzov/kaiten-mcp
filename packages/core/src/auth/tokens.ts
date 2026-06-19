import { createHash } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'

export interface TokenPayload {
	kaitenToken: string
	kaitenUrl?: string
	kind: 'code' | 'access' | 'refresh'
	/** Только для code: привязка PKCE и redirect. */
	code_challenge?: string
	redirect_uri?: string
	[k: string]: unknown
}

/** 32-байтный ключ из произвольного секрета. */
function keyFromSecret(secret: string): Uint8Array {
	return new Uint8Array(createHash('sha256').update(secret).digest())
}

export async function sealToken(
	payload: TokenPayload,
	secret: string,
	expiresIn: string | number,
): Promise<string> {
	return new EncryptJWT(payload as Record<string, unknown>)
		.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.encrypt(keyFromSecret(secret))
}

export async function openToken(jwe: string, secret: string): Promise<TokenPayload> {
	const { payload } = await jwtDecrypt(jwe, keyFromSecret(secret))
	return payload as unknown as TokenPayload
}
