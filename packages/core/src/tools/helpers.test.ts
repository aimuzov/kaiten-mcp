import { describe, it, expect } from 'vitest'
import { compact, makeToolContext } from './helpers.js'
import type { KaitenClient } from '../kaiten-client.js'

describe('compact', () => {
	it('removes keys with undefined values', () => {
		expect(compact({ a: 1, b: undefined })).toEqual({ a: 1 })
	})

	it('keeps keys with null values so PATCH can reset fields', () => {
		expect(compact({ due_date: null, title: 'x', skip: undefined })).toEqual({
			due_date: null,
			title: 'x',
		})
	})

	it('keeps falsy but defined values', () => {
		expect(compact({ a: 0, b: '', c: false })).toEqual({ a: 0, b: '', c: false })
	})
})

describe('ToolContext.getClient', () => {
	it('returns the client produced by the resolver, passing extra through', () => {
		const fake = { marker: 'from-extra' } as unknown as KaitenClient
		const ctx = makeToolContext({
			server: {} as never,
			logger: { error() {}, warn() {}, info() {}, debug() {} } as never,
			config: { requestTimeoutMs: 1, maxConcurrentRequests: 1, logLevel: 'error' } as never,
			resolveClient: (extra) => {
				expect((extra as { tag?: string })?.tag).toBe('abc')
				return fake
			},
		})
		expect(ctx.getClient({ tag: 'abc' } as never)).toBe(fake)
	})
})
