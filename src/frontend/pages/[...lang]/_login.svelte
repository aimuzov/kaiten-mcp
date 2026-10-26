<script lang="ts">
	import type { TokenField } from '@aimuzov/infra-mcp-kit/astro'
	import TokenForm from '@aimuzov/infra-mcp-kit/astro/components/token-form.svelte'
	import { pt } from '@aimuzov/infra-mcp-kit/astro/lib/i18n.ts'

	let { locale = 'ru' }: { locale?: string } = $props()

	// Имена полей те же, что у `kaitenLogin` в `src/http.ts`:
	// по ним сервер собирает значения.
	const url: TokenField = $derived({
		name: 'kaiten_url',
		label: pt(locale, 'kaiten.url'),
		type: 'url',
		placeholder: 'https://your-domain.kaiten.ru',
		hint: pt(locale, 'kaiten.urlHint'),
	})
	const token: TokenField = $derived({
		name: 'kaiten_token',
		label: pt(locale, 'kaiten.token'),
		type: 'password',
		hint: pt(locale, 'kaiten.tokenHint'),
	})

	// Страница статическая, а KAITEN_API_URL известен только серверу: если адрес задан там,
	// сервер кладёт `kaitenUrl=fixed` во фрагмент, и поле адреса пропадает после гидрации.
	let fixedUrl = $state(false)

	$effect(() => {
		fixedUrl = new URLSearchParams(location.hash.slice(1)).get('kaitenUrl') === 'fixed'
	})
</script>

<TokenForm
	title={pt(locale, 'kaiten.loginTitle')}
	lead={pt(locale, 'kaiten.loginLead')}
	fields={fixedUrl ? [token] : [url, token]}
	{locale}
/>
