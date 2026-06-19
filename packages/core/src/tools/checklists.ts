import { z } from 'zod'
import { compact, run, type ToolContext } from './helpers.js'

export function registerChecklistTools(ctx: ToolContext): void {
	const { server } = ctx

	server.registerTool(
		'kaiten_list_checklists',
		{
			title: 'Чек-листы карточки',
			description: 'Возвращает чек-листы карточки вместе с их пунктами.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
			},
		},
		(args, extra) => run(ctx, extra, (client) => client.get(`/cards/${args.card_id}/checklists`)),
	)

	server.registerTool(
		'kaiten_add_checklist',
		{
			title: 'Добавить чек-лист',
			description: 'Создаёт новый чек-лист на карточке.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				name: z.string().min(1).describe('Название чек-листа'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.post(`/cards/${args.card_id}/checklists`, { name: args.name }),
			),
	)

	server.registerTool(
		'kaiten_add_checklist_item',
		{
			title: 'Добавить пункт чек-листа',
			description: 'Добавляет пункт в чек-лист карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				checklist_id: z.number().int().describe('ID чек-листа'),
				text: z.string().min(1).describe('Текст пункта'),
			},
		},
		(args, extra) =>
			run(ctx, extra, (client) =>
				client.post(`/cards/${args.card_id}/checklists/${args.checklist_id}/items`, {
					text: args.text,
				}),
			),
	)

	server.registerTool(
		'kaiten_update_checklist_item',
		{
			title: 'Обновить пункт чек-листа',
			description: 'Изменяет текст и/или статус (выполнен) пункта чек-листа.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				checklist_id: z.number().int().describe('ID чек-листа'),
				item_id: z.number().int().describe('ID пункта'),
				text: z.string().optional().describe('Новый текст'),
				checked: z.boolean().optional().describe('Отметить выполненным/невыполненным'),
			},
		},
		(args, extra) => {
			const { card_id, checklist_id, item_id, ...rest } = args
			return run(ctx, extra, (client) =>
				client.patch(
					`/cards/${card_id}/checklists/${checklist_id}/items/${item_id}`,
					compact(rest),
				),
			)
		},
	)

	server.registerTool(
		'kaiten_delete_checklist_item',
		{
			title: 'Удалить пункт чек-листа',
			description: 'Удаляет пункт чек-листа карточки.',
			inputSchema: {
				card_id: z.number().int().describe('ID карточки'),
				checklist_id: z.number().int().describe('ID чек-листа'),
				item_id: z.number().int().describe('ID пункта'),
			},
		},
		(args, extra) =>
			run(ctx, extra, async (client) => {
				await client.delete(
					`/cards/${args.card_id}/checklists/${args.checklist_id}/items/${args.item_id}`,
				)
				return { deleted: true, item_id: args.item_id }
			}),
	)
}
