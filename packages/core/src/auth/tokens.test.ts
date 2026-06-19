import { describe, it, expect } from 'vitest'
import { sealToken, openToken } from './tokens.js'

const secret = 'test-secret-test-secret-test-secret'

describe('JWE tokens', () => {
	it('seals and opens payload', async () => {
		const jwe = await sealToken(
			{ kaitenToken: 'k', kaitenUrl: 'https://x/api/latest', kind: 'access' },
			secret,
			'12h',
		)
		const payload = await openToken(jwe, secret)
		expect(payload.kaitenToken).toBe('k')
		expect(payload.kind).toBe('access')
	})

	it('rejects tampered/foreign token', async () => {
		const jwe = await sealToken({ kaitenToken: 'k', kind: 'access' }, secret, '12h')
		await expect(openToken(jwe, 'other-secret-other-secret-other!')).rejects.toThrow()
	})

	it('rejects expired token', async () => {
		const jwe = await sealToken({ kaitenToken: 'k', kind: 'access' }, secret, '0s')
		await new Promise((r) => setTimeout(r, 1100))
		await expect(openToken(jwe, secret)).rejects.toThrow()
	})
})
