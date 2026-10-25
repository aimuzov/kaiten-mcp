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
				tools: ['Карточки и доски', 'Комментарии и чек-листы', 'Учёт времени', 'План на день'],
				accent: { light: '#e8590c', dark: '#ff8a4c' },
			},
		}),
	],
})
