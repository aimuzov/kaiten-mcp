import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/** Адрес, куда коннектор не пойдёт. Текст можно показать человеку. */
export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'UnsafeUrlError'
	}
}

/** Проверка адреса перед запросом. Бросает `UnsafeUrlError`. */
export type UrlGuard = (apiUrl: string) => Promise<void>

/** Все адреса хоста, как их вернёт резолвер. */
export type Resolve = (host: string) => Promise<string[]>

const resolveAll: Resolve = async (host) =>
	(await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)

const internal = new BlockList()

for (const [net, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	// Link-local, здесь же метаданные облаков 169.254.169.254.
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
] as const) {
	internal.addSubnet(net, prefix, 'ipv4')
}

for (const [net, prefix] of [
	['::', 128],
	['::1', 128],
	// Unique local, здесь же метаданные AWS fd00:ec2::254.
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8],
] as const) {
	internal.addSubnet(net, prefix, 'ipv6')
}

/** Loopback, частная сеть, link-local и прочее, куда снаружи ходить нельзя. */
export function isInternalAddress(address: string): boolean {
	const family = isIP(address)

	// Не IP вовсе -- тоже отказ: проверить такой адрес нечем.
	if (family === 0) return true

	// BlockList сам сверяет ::ffff:127.0.0.1 с правилами IPv4.
	return internal.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

/**
 * Защита от SSRF, когда адрес Kaiten вводит посетитель формы: только https
 * и только хосты, которые резолвятся в публичные адреса.
 */
export function publicUrlGuard(resolve: Resolve = resolveAll): UrlGuard {
	return async (apiUrl) => {
		let url: URL

		try {
			url = new URL(apiUrl)
		} catch {
			throw new UnsafeUrlError('Это не похоже на адрес Kaiten')
		}

		if (url.protocol !== 'https:') throw new UnsafeUrlError('Адрес Kaiten должен начинаться с https://')

		const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
		let addresses: string[]

		try {
			addresses = await resolve(host)
		} catch {
			throw new UnsafeUrlError(`Не нашёл хост ${host}`)
		}

		if (addresses.length === 0 || addresses.some(isInternalAddress)) {
			throw new UnsafeUrlError(`${host} ведёт во внутреннюю сеть, такой адрес не подойдёт`)
		}
	}
}
