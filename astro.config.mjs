import mcpPages from '@aimuzov/infra-mcp-kit/astro'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

export default defineConfig({
	// Страницы живут в `src/frontend`, как у сайтов, рядом с кодом сервера в `src`.
	srcDir: './src/frontend',
	// Сервер раздаёт отсюда статику: `PUBLIC_DIR` в `src/http.ts`.
	outDir: './build/public',
	integrations: [
		svelte(),
		// `tokenForm` нет: свою `/login` kaiten рисует сам,
		// см. `src/frontend/pages/login.astro`.
		mcpPages({
			service: {
				name: 'kaiten',
				repo: 'https://github.com/aimuzov/kaiten-mcp',
				tagline: 'Карточки, доски и планирование дня Kaiten прямо из Claude',
				lead: 'Добавь адрес коннектора в Claude и войди своим API-токеном Kaiten.',
				tools: [
					{ label: 'Карточки и доски', icon: 'kanban' },
					{ label: 'Комментарии и чек-листы', icon: 'list-checks' },
					{ label: 'Учёт времени', icon: 'timer' },
					{ label: 'План на день', icon: 'calendar-check' },
				],
				// Фиолетовый, красный и бирюзовый -- цвета Kaiten с kaiten.ru, знак -- из его фавикона.
				// Он обозначает сервис, к которому подключается коннектор, а подпись автора остаётся в футере.
				accent: { light: '#7d4ccf', dark: '#ad73fe' },
				glitch: { a: '#f11f24', b: '#5fe8b0' },
				logo: './src/frontend/assets/kaiten-mark.svg',
				// Английский: переводы полей выше по ключам кита и строки своей страницы входа.
				strings: {
					en: {
						'service.tagline': 'Cards, boards and day planning of Kaiten right from Claude',
						'service.lead': 'Add the connector address to Claude and sign in with your Kaiten API token.',
						'tool.Карточки и доски': 'Cards and boards',
						'tool.Комментарии и чек-листы': 'Comments and checklists',
						'tool.Учёт времени': 'Time tracking',
						'tool.План на день': 'Plan for the day',
						'kaiten.loginTitle': 'Connecting to Kaiten',
						'kaiten.loginLead':
							'The token is only used for your requests. It is encrypted into the access token and is not stored on the server.',
						'kaiten.url': 'Kaiten address',
						'kaiten.urlHint': 'The one you open in the browser',
						'kaiten.token': 'Kaiten API token',
						'kaiten.tokenHint': 'Profile → API keys → Create',
					},
					ru: {
						'kaiten.loginTitle': 'Подключение к Kaiten',
						'kaiten.loginLead':
							'Токен нужен только для твоих запросов. Он шифруется в токен доступа и на сервере не хранится.',
						'kaiten.url': 'Адрес Kaiten',
						'kaiten.urlHint': 'Тот, что открываешь в браузере',
						'kaiten.token': 'API-токен Kaiten',
						'kaiten.tokenHint': 'Профиль → API-ключи → Создать',
					},
				},
			},
			locales: ['ru', 'en'],
		}),
	],
})
