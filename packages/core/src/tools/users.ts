import { z } from 'zod'
import { compact, run, type ToolContext } from './helpers.js'

export function registerUserTools(ctx: ToolContext): void {
	const { server } = ctx

	server.registerTool(
		'kaiten_get_current_user',
		{
			title: 'Текущий пользователь',
			description:
				'Возвращает данные текущего пользователя (того, чей API-токен используется). ' +
				'Полезно, чтобы узнать свой user id для планировочных инструментов.',
			inputSchema: {},
		},
		(_args, extra) => run(ctx, extra, (client) => client.getCurrentUser()),
	)

	server.registerTool(
		'kaiten_list_users',
		{
			title: 'Список пользователей',
			description:
				'Возвращает список пользователей компании. Можно фильтровать по подстроке имени/email через query.',
			inputSchema: {
				query: z.string().optional().describe('Поиск по имени/email'),
				limit: z.number().int().positive().max(1000).optional().describe('Максимум записей'),
				offset: z.number().int().nonnegative().optional().describe('Смещение для пагинации'),
			},
		},
		(args, extra) => run(ctx, extra, (client) => client.listUsers(compact(args))),
	)
}
