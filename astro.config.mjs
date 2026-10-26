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
				// Фиолетовый, красный и бирюзовый -- цвета Kaiten с kaiten.ru, знак -- из его фавикона.
				// Он обозначает сервис, к которому подключается коннектор, а подпись автора остаётся в футере.
				accent: { light: '#7d4ccf', dark: '#ad73fe' },
				glitch: { a: '#f11f24', b: '#5fe8b0' },
				logo: './src/frontend/assets/kaiten-mark.svg',
			},
		}),
	],
})
