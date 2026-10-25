import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'

import { CredentialsProvider } from './credentials.ts'
import { KaitenClient } from './kaiten-client.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'
import { isInternalAddress, publicUrlGuard, UnsafeUrlError } from './url-guard.ts'

const quiet = createLogger({ level: 'error', write: () => {} })
const kaiten = await fakeKaiten()

after(() => kaiten.close())

/** Резолвер без сети: хост -> адреса по таблице. */
const resolver = (table: Record<string, string[]>) => async (host: string) => {
	const addresses = table[host]

	if (!addresses) throw new Error(`ENOTFOUND ${host}`)

	return addresses
}

test('внутренние адреса IPv4 и IPv6 распознаются, публичные -- нет', () => {
	for (const address of [
		'127.0.0.1',
		'10.1.2.3',
		'172.20.0.1',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'::1',
		'::',
		'fe80::1',
		'fd00:ec2::254',
		'::ffff:127.0.0.1',
		'::ffff:a9fe:a9fe',
		'not-an-ip',
	]) {
		assert.equal(isInternalAddress(address), true, address)
	}

	for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
		assert.equal(isInternalAddress(address), false, address)
	}
})

test('проверка адреса пускает только https на публичный хост', async () => {
	const guard = publicUrlGuard(
		resolver({
			'x.kaiten.ru': ['93.184.216.34'],
			'evil.example': ['93.184.216.34', '10.0.0.5'],
			'metadata.example': ['169.254.169.254'],
			'::1': ['::1'],
		}),
	)

	await guard('https://x.kaiten.ru/api/latest')

	await assert.rejects(guard('http://x.kaiten.ru/api/latest'), /должен начинаться с https/)
	await assert.rejects(guard('https://evil.example/api/latest'), /внутреннюю сеть/)
	await assert.rejects(guard('https://metadata.example/api/latest'), /внутреннюю сеть/)
	await assert.rejects(guard('https://[::1]/api/latest'), /внутреннюю сеть/)
	await assert.rejects(guard('https://nowhere.example/api/latest'), /Не нашёл хост nowhere.example/)
	await assert.rejects(guard('not a url'), UnsafeUrlError)
})

test('клиент с проверкой не ходит на внутренний адрес вовсе', async () => {
	const before = kaiten.requests.length
	const client = new KaitenClient(
		{ requestTimeoutMs: 5000, maxConcurrentRequests: 1, logLevel: 'error' },
		new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: GOOD_TOKEN }, quiet),
		quiet,
		{ guardUrl: publicUrlGuard() },
	)

	await assert.rejects(client.getCurrentUser(), UnsafeUrlError)
	assert.equal(kaiten.requests.length, before)
})
