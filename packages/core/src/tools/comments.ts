import { z } from 'zod'
import { run, type ToolContext } from './helpers.js'

export function registerCommentTools(ctx: ToolContext): void {
	const { server } = ctx

	server.registerTool(
		'kaiten_list_comments',
		{
			title: 'Комментарии карточки',
			description: 'Возвращает комментарии карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
			},
		},
		(args, extra) => run(ctx, extra, (client) => client.get(`/cards/${args.card_id}/comments`)),
	)

	server.registerTool(
		'kaiten_create_comment',
		{
			title: 'Добавить комментарий',
			description: 'Добавляет комментарий к карточке. Текст поддерживает markdown.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				text: z.string().min(1).describe('Текст комментария'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.post(`/cards/${args.card_id}/comments`, { text: args.text }),
			),
	)

	server.registerTool(
		'kaiten_update_comment',
		{
			title: 'Изменить комментарий',
			description: 'Изменяет текст существующего комментария.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				comment_id: z.number().int().describe('ID комментария'),
				text: z.string().min(1).describe('Новый текст'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.patch(`/cards/${args.card_id}/comments/${args.comment_id}`, { text: args.text }),
			),
	)

	server.registerTool(
		'kaiten_delete_comment',
		{
			title: 'Удалить комментарий',
			description: 'Удаляет комментарий карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				comment_id: z.number().int().describe('ID комментария'),
			},
		},
		(args, extra) =>
			run(ctx, extra, async (client) => {
				await client.delete(`/cards/${args.card_id}/comments/${args.comment_id}`)
				return { deleted: true, comment_id: args.comment_id }
			}),
	)
}
