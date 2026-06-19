import { describe, it, expect } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { verifyPkceS256 } from './pkce.js'

function b64url(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('verifyPkceS256', () => {
	it('accepts a valid verifier/challenge pair', () => {
		const verifier = b64url(randomBytes(32))
		const challenge = b64url(createHash('sha256').update(verifier).digest())
		expect(verifyPkceS256(verifier, challenge)).toBe(true)
	})
	it('rejects a wrong verifier', () => {
		const challenge = b64url(createHash('sha256').update('right').digest())
		expect(verifyPkceS256('wrong', challenge)).toBe(false)
	})
})
