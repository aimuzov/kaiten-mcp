<script lang="ts">
	import type { TokenField } from '@aimuzov/infra-mcp-kit/astro'
	import TokenForm from '@aimuzov/infra-mcp-kit/astro/components/token-form.svelte'

	// Имена полей те же, что у `kaitenLogin` в `src/http.ts`:
	// по ним сервер собирает значения.
	const url: TokenField = {
		name: 'kaiten_url',
		label: 'Адрес Kaiten',
		type: 'url',
		placeholder: 'https://your-domain.kaiten.ru',
		hint: 'Тот, что открываешь в браузере',
	}
	const token: TokenField = {
		name: 'kaiten_token',
		label: 'API-токен Kaiten',
		type: 'password',
		hint: 'Профиль → API-ключи → Создать',
	}

	// Страница статическая, а KAITEN_API_URL известен только серверу: если адрес задан там,
	// сервер кладёт `kaitenUrl=fixed` во фрагмент, и поле адреса пропадает после гидрации.
	let fixedUrl = $state(false)

	$effect(() => {
		fixedUrl = new URLSearchParams(location.hash.slice(1)).get('kaitenUrl') === 'fixed'
	})
</script>

<TokenForm
	title="Подключение к Kaiten"
	lead="Токен нужен только для твоих запросов. Он шифруется в токен доступа и на сервере не хранится."
	fields={fixedUrl ? [token] : [url, token]}
/>
