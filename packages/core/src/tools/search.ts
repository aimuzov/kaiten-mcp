import { z } from "zod";
import { compact, run, type ToolContext } from "./helpers.js";

export function registerSearchTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "kaiten_search_cards",
    {
      title: "Поиск/выборка карточек",
      description:
        "Гибкая выборка карточек по фильтрам. Все фильтры опциональны и комбинируются. " +
        "Для редких параметров Kaiten API, не вынесенных в явные поля, используйте extra_params. " +
        "Возвращает массив карточек.",
      inputSchema: {
        query: z.string().optional().describe("Полнотекстовый поиск по карточкам"),
        space_id: z.number().int().optional().describe("Фильтр по пространству"),
        board_id: z.number().int().optional().describe("Фильтр по доске"),
        column_id: z.number().int().optional().describe("Фильтр по колонке"),
        lane_id: z.number().int().optional().describe("Фильтр по дорожке"),
        type_id: z.number().int().optional().describe("Фильтр по типу карточки"),
        owner_id: z.number().int().optional().describe("Фильтр по владельцу"),
        responsible_id: z.number().int().optional().describe("Фильтр по ответственному"),
        member_ids: z.array(z.number().int()).optional().describe("Фильтр по участникам (ID)"),
        tag_ids: z.array(z.number().int()).optional().describe("Фильтр по тегам (ID)"),
        condition: z
          .number()
          .int()
          .optional()
          .describe("Состояние: 1 — активные, 2 — архивные"),
        archived: z.boolean().optional().describe("Включать архивные"),
        due_date_from: z.string().optional().describe("Срок не раньше (ISO/YYYY-MM-DD)"),
        due_date_to: z.string().optional().describe("Срок не позже (ISO/YYYY-MM-DD)"),
        limit: z.number().int().positive().max(1000).optional().describe("Максимум записей (по умолч. API)"),
        offset: z.number().int().nonnegative().optional().describe("Смещение пагинации"),
        extra_params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Доп. query-параметры Kaiten API, передаваемые как есть"),
      },
    },
    (args, extra) =>
      run(ctx, extra, (client) => {
        const { extra_params, member_ids, tag_ids, ...rest } = args;
        const params: Record<string, unknown> = compact(rest);
        if (member_ids?.length) params.member_ids = member_ids.join(",");
        if (tag_ids?.length) params.tag_ids = tag_ids.join(",");
        if (extra_params) Object.assign(params, extra_params);
        return client.listCards(params);
      })
  );
}
