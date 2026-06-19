import { z } from 'zod'
import { run, type ToolContext } from './helpers.js'

/** Управление участниками и тегами карточки. */
export function registerCardExtraTools(ctx: ToolContext): void {
	const { server } = ctx

	server.registerTool(
		'kaiten_add_card_member',
		{
			title: 'Добавить участника',
			description: 'Добавляет пользователя в участники карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				user_id: z.number().int().describe('ID пользователя'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.post(`/cards/${args.card_id}/members`, { user_id: args.user_id }),
			),
	)

	server.registerTool(
		'kaiten_remove_card_member',
		{
			title: 'Убрать участника',
			description: 'Удаляет пользователя из участников карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				user_id: z.number().int().describe('ID пользователя'),
			},
		},
		(args, extra) =>
			run(ctx, extra, async (client) => {
				await client.delete(`/cards/${args.card_id}/members/${args.user_id}`)
				return { removed: true, user_id: args.user_id }
			}),
	)

	server.registerTool(
		'kaiten_add_card_tag',
		{
			title: 'Добавить тег',
			description: 'Добавляет тег к карточке по имени (создаётся при необходимости).',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				name: z.string().min(1).describe('Имя тега'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) => client.post(`/cards/${args.card_id}/tags`, { name: args.name })),
	)

	server.registerTool(
		'kaiten_remove_card_tag',
		{
			title: 'Убрать тег',
			description: 'Удаляет тег с карточки по ID тега.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				tag_id: z.number().int().describe('ID тега'),
			},
		},
		(args, extra) =>
			run(ctx, extra, async (client) => {
				await client.delete(`/cards/${args.card_id}/tags/${args.tag_id}`)
				return { removed: true, tag_id: args.tag_id }
			}),
	)
}
