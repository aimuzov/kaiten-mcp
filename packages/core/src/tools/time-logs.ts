import { z } from "zod";
import { compact, run, type ToolContext } from "./helpers.js";

export function registerTimeLogTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "kaiten_list_time_logs",
    {
      title: "Списания времени",
      description: "Возвращает записи учёта времени (time logs) по карточке.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
      },
    },
    (args) => run(ctx, () => client.get(`/cards/${args.card_id}/time-logs`))
  );

  server.registerTool(
    "kaiten_add_time_log",
    {
      title: "Списать время",
      description: "Добавляет запись учёта времени к карточке. time_spent указывается в минутах.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
        time_spent: z.number().positive().describe("Затраченное время в минутах"),
        for_date: z.string().optional().describe("Дата списания YYYY-MM-DD (по умолч. сегодня)"),
        comment: z.string().optional().describe("Комментарий к списанию"),
        role_id: z.number().int().optional().describe("ID роли (если используется учёт по ролям)"),
      },
    },
    (args) => {
      const { card_id, ...rest } = args;
      return run(ctx, () => client.post(`/cards/${card_id}/time-logs`, compact(rest)));
    }
  );

  server.registerTool(
    "kaiten_delete_time_log",
    {
      title: "Удалить списание времени",
      description: "Удаляет запись учёта времени с карточки.",
      inputSchema: {
        card_id: z.number().int().describe("ID карточки"),
        time_log_id: z.number().int().describe("ID записи учёта времени"),
      },
    },
    (args) =>
      run(ctx, async () => {
        await client.delete(`/cards/${args.card_id}/time-logs/${args.time_log_id}`);
        return { deleted: true, time_log_id: args.time_log_id };
      })
  );
}
