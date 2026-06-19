import { defineConfig } from 'cz-git'

export default defineConfig({
	extends: ['@commitlint/config-conventional'],
	// cz-git читает секцию `prompt` для интерактивного `npm run commit`.
	prompt: {
		useEmoji: false,
		allowEmptyScopes: true,
		allowCustomScopes: true,
		allowBreakingChanges: ['feat', 'fix'],
	},
})
