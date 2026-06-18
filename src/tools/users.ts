import { z } from "zod";
import { compact, run, type ToolContext } from "./helpers.js";

export function registerUserTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "kaiten_get_current_user",
    {
      title: "Текущий пользователь",
      description:
        "Возвращает данные текущего пользователя (того, чей API-токен используется). " +
        "Полезно, чтобы узнать свой user id для планировочных инструментов.",
      inputSchema: {},
    },
    () => run(ctx, () => client.getCurrentUser())
  );

  server.registerTool(
    "kaiten_list_users",
    {
      title: "Список пользователей",
      description: "Возвращает список пользователей компании. Можно фильтровать по подстроке имени/email через query.",
      inputSchema: {
        query: z.string().optional().describe("Поиск по имени/email"),
        limit: z.number().int().positive().max(1000).optional().describe("Максимум записей"),
        offset: z.number().int().nonnegative().optional().describe("Смещение для пагинации"),
      },
    },
    (args) => run(ctx, () => client.listUsers(compact(args)))
  );
}
