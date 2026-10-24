import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadConfig, normalizeApiUrl, redactToken } from './config.ts'

test('адрес Kaiten приводится к /api/latest без хвостового слэша', () => {
	assert.equal(normalizeApiUrl('https://x.kaiten.ru'), 'https://x.kaiten.ru/api/latest')
	assert.equal(normalizeApiUrl('x.kaiten.ru/'), 'https://x.kaiten.ru/api/latest')
	assert.equal(normalizeApiUrl(' https://x.kaiten.ru/api/latest/ '), 'https://x.kaiten.ru/api/latest')
	assert.equal(normalizeApiUrl('https://x.kaiten.ru/api/v1'), 'https://x.kaiten.ru/api/v1')
})

test('без переменных креды пусты, а числа берут значения по умолчанию', () => {
	assert.deepEqual(loadConfig({}), {
		apiUrl: undefined,
		apiToken: undefined,
		defaultSpaceId: undefined,
		requestTimeoutMs: 30_000,
		maxConcurrentRequests: 5,
		logLevel: 'info',
		logFile: undefined,
	})
})

test('настройки из окружения зажимаются в допустимые рамки', () => {
	const config = loadConfig({
		KAITEN_API_URL: 'x.kaiten.ru',
		KAITEN_API_TOKEN: ' t ',
		KAITEN_DEFAULT_SPACE_ID: '42',
		KAITEN_REQUEST_TIMEOUT_MS: '10',
		KAITEN_MAX_CONCURRENT_REQUESTS: '99',
		KAITEN_LOG_LEVEL: 'DEBUG',
	})

	assert.equal(config.apiUrl, 'https://x.kaiten.ru/api/latest')
	assert.equal(config.apiToken, 't')
	assert.equal(config.defaultSpaceId, 42)
	assert.equal(config.requestTimeoutMs, 1000)
	assert.equal(config.maxConcurrentRequests, 20)
	assert.equal(config.logLevel, 'debug')
	assert.equal(loadConfig({ KAITEN_LOG_LEVEL: 'loud', KAITEN_DEFAULT_SPACE_ID: 'x' }).logLevel, 'info')
})

test('в логах от токена остаются только края', () => {
	assert.equal(redactToken('abcdefghijkl'), 'abcd…ijkl')
	assert.equal(redactToken('short'), '***')
})
