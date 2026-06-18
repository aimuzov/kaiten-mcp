import { z } from "zod";
import { compact, run, type ToolContext } from "./helpers.js";

export function registerCardTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "kaiten_get_card",
    {
      title: "Карточка",
      description: "Возвращает карточку по ID со всеми полями (описание, участники, теги, сроки и т.д.).",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
      },
    },
    (args, extra) => run(ctx, extra, (client) => client.getCard(args.card_id))
  );

  server.registerTool(
    "kaiten_create_card",
    {
      title: "Создать карточку",
      description:
        "Создаёт новую карточку. Обязательны board_id, column_id и title. " +
        "Остальные поля опциональны.",
      inputSchema: {
        board_id: z.number().int().describe("ID доски"),
        column_id: z.number().int().describe("ID колонки"),
        title: z.string().min(1).describe("Заголовок карточки"),
        lane_id: z.number().int().optional().describe("ID дорожки"),
        type_id: z.number().int().optional().describe("ID типа карточки"),
        description: z.string().optional().describe("Описание (поддерживает markdown)"),
        owner_id: z.number().int().optional().describe("ID владельца"),
        responsible_id: z.number().int().optional().describe("ID ответственного"),
        due_date: z.string().optional().describe("Срок в ISO-формате, напр. 2026-06-20T12:00:00Z"),
        asap: z.boolean().optional().describe("Пометить как срочную (ASAP)"),
      },
    },
    (args, extra) => run(ctx, extra, (client) => client.post("/cards", compact(args)))
  );

  server.registerTool(
    "kaiten_update_card",
    {
      title: "Обновить карточку",
      description:
        "Обновляет поля карточки. Передавайте только те поля, которые нужно изменить.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
        title: z.string().optional().describe("Новый заголовок"),
        description: z.string().optional().describe("Новое описание"),
        column_id: z.number().int().optional().describe("Переместить в колонку"),
        lane_id: z.number().int().optional().describe("Переместить в дорожку"),
        board_id: z.number().int().optional().describe("Переместить на доску"),
        owner_id: z.number().int().optional().describe("Сменить владельца"),
        responsible_id: z.number().int().optional().describe("Сменить ответственного"),
        due_date: z.string().nullable().optional().describe("Срок (ISO) или null чтобы убрать"),
        asap: z.boolean().optional().describe("Срочность (ASAP)"),
        sort_order: z.number().optional().describe("Позиция сортировки"),
      },
    },
    (args, extra) => {
      const { card_id, ...rest } = args;
      return run(ctx, extra, (client) => client.patch(`/cards/${card_id}`, compact(rest)));
    }
  );

  server.registerTool(
    "kaiten_move_card",
    {
      title: "Переместить карточку",
      description:
        "Перемещает карточку в другую колонку/дорожку/на другую доску. Удобная обёртка над update.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
        column_id: z.number().int().optional().describe("Целевая колонка"),
        lane_id: z.number().int().optional().describe("Целевая дорожка"),
        board_id: z.number().int().optional().describe("Целевая доска"),
      },
    },
    (args, extra) => {
      const { card_id, ...rest } = args;
      const payload = compact(rest);
      if (Object.keys(payload).length === 0) {
        return run(ctx, extra, async () => {
          throw new Error("Укажите хотя бы один из: column_id, lane_id, board_id");
        });
      }
      return run(ctx, extra, (client) => client.patch(`/cards/${card_id}`, payload));
    }
  );

  server.registerTool(
    "kaiten_delete_card",
    {
      title: "Удалить карточку",
      description: "Удаляет карточку по ID. Действие необратимо — используйте осознанно.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
      },
    },
    (args, extra) =>
      run(ctx, extra, async (client) => {
        await client.delete(`/cards/${args.card_id}`);
        return { deleted: true, card_id: args.card_id };
      })
  );

  server.registerTool(
    "kaiten_archive_card",
    {
      title: "Архивировать карточку",
      description: "Архивирует карточку (condition = 2), не удаляя её.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
      },
    },
    (args, extra) => run(ctx, extra, (client) => client.patch(`/cards/${args.card_id}`, { condition: 2 }))
  );
}
