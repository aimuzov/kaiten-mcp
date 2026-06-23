import { z } from 'zod'
import { compact, run, type ToolContext } from './helpers.js'

/** Управление внешними ссылками карточки (external links). */
export function registerExternalLinkTools(ctx: ToolContext): void {
	const { server } = ctx

	server.registerTool(
		'kaiten_list_card_external_links',
		{
			title: 'Внешние ссылки карточки',
			description: 'Возвращает внешние ссылки (external links) карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) => client.get(`/cards/${args.card_id}/external-links`)),
	)

	server.registerTool(
		'kaiten_add_card_external_link',
		{
			title: 'Добавить внешнюю ссылку',
			description:
				'Привязывает к карточке внешнюю ссылку (например, на merge request). Предпочтительнее комментария: ссылка отображается как связанный ресурс и не засоряет ленту.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				url: z.string().min(1).describe('URL внешнего ресурса'),
				description: z.string().optional().describe('Подпись ссылки, напр. "MR !989"'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.post(
					`/cards/${args.card_id}/external-links`,
					compact({ url: args.url, description: args.description }),
				),
			),
	)

	server.registerTool(
		'kaiten_update_card_external_link',
		{
			title: 'Изменить внешнюю ссылку',
			description: 'Изменяет URL и/или подпись внешней ссылки карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				external_link_id: z.number().int().describe('ID внешней ссылки'),
				url: z.string().min(1).optional().describe('Новый URL'),
				description: z.string().optional().describe('Новая подпись'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.patch(
					`/cards/${args.card_id}/external-links/${args.external_link_id}`,
					compact({ url: args.url, description: args.description }),
				),
			),
	)

	server.registerTool(
		'kaiten_remove_card_external_link',
		{
			title: 'Удалить внешнюю ссылку',
			description: 'Удаляет внешнюю ссылку карточки по ID ссылки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				external_link_id: z.number().int().describe('ID внешней ссылки'),
			},
		},
		(args, extra) =>
			run(ctx, extra, async (client) => {
				await client.delete(`/cards/${args.card_id}/external-links/${args.external_link_id}`)
				return { removed: true, external_link_id: args.external_link_id }
			}),
	)
}
