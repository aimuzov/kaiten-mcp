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

test('настройки берутся из окружения', () => {
	const config = loadConfig({
		KAITEN_API_URL: 'x.kaiten.ru',
		KAITEN_API_TOKEN: ' t ',
		KAITEN_DEFAULT_SPACE_ID: '42',
		KAITEN_REQUEST_TIMEOUT_MS: '1000',
		KAITEN_MAX_CONCURRENT_REQUESTS: '20',
		KAITEN_LOG_LEVEL: 'DEBUG',
	})

	assert.equal(config.apiUrl, 'https://x.kaiten.ru/api/latest')
	assert.equal(config.apiToken, 't')
	assert.equal(config.defaultSpaceId, 42)
	assert.equal(config.requestTimeoutMs, 1000)
	assert.equal(config.maxConcurrentRequests, 20)
	assert.equal(config.logLevel, 'debug')
})

test('пустая переменная берёт значение по умолчанию', () => {
	const config = loadConfig({ KAITEN_DEFAULT_SPACE_ID: ' ', KAITEN_REQUEST_TIMEOUT_MS: '', KAITEN_LOG_LEVEL: '' })

	assert.equal(config.defaultSpaceId, undefined)
	assert.equal(config.requestTimeoutMs, 30_000)
	assert.equal(config.logLevel, 'info')
})

test('мусор в переменной -- ошибка с её именем, а не тихое значение по умолчанию', () => {
	assert.throws(() => loadConfig({ KAITEN_DEFAULT_SPACE_ID: 'abc' }), /KAITEN_DEFAULT_SPACE_ID: .*"abc"/)
	assert.throws(() => loadConfig({ KAITEN_DEFAULT_SPACE_ID: '0' }), /KAITEN_DEFAULT_SPACE_ID/)

	assert.throws(
		() => loadConfig({ KAITEN_REQUEST_TIMEOUT_MS: '10' }),
		/KAITEN_REQUEST_TIMEOUT_MS: .*от 1000 до 600000/,
	)

	assert.throws(() => loadConfig({ KAITEN_REQUEST_TIMEOUT_MS: '30s' }), /KAITEN_REQUEST_TIMEOUT_MS/)
	assert.throws(() => loadConfig({ KAITEN_MAX_CONCURRENT_REQUESTS: '99' }), /KAITEN_MAX_CONCURRENT_REQUESTS/)
	assert.throws(() => loadConfig({ KAITEN_LOG_LEVEL: 'loud' }), /KAITEN_LOG_LEVEL: .*"loud"/)
})

test('в логах от токена остаются только края', () => {
	assert.equal(redactToken('abcdefghijkl'), 'abcd…ijkl')
	assert.equal(redactToken('short'), '***')
})
