// Пропускаем установку git-хуков в CI и production-окружениях (Vercel и т.п.)
if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === 'production') {
	process.exit(0)
}
const husky = (await import('husky')).default
console.log(husky())
