import { z } from "zod";
import { run, type ToolContext } from "./helpers.js";

export function registerLookupTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "kaiten_list_columns",
    {
      title: "Колонки доски",
      description:
        "Возвращает колонки (columns) доски. У колонки есть поле type: 1 — очередь, 2 — в работе, 3 — готово.",
      inputSchema: {
        board_id: z.number().int().describe("ID доски"),
      },
    },
    (args) => run(ctx, () => client.listColumns(args.board_id))
  );

  server.registerTool(
    "kaiten_list_lanes",
    {
      title: "Дорожки доски",
      description: "Возвращает дорожки (lanes / горизонтальные ряды) доски.",
      inputSchema: {
        board_id: z.number().int().describe("ID доски"),
      },
    },
    (args) => run(ctx, () => client.listLanes(args.board_id))
  );

  server.registerTool(
    "kaiten_list_card_types",
    {
      title: "Типы карточек",
      description: "Возвращает доступные типы карточек (card types) компании.",
      inputSchema: {},
    },
    () => run(ctx, () => client.get("/card-types"))
  );

  server.registerTool(
    "kaiten_list_tags",
    {
      title: "Теги",
      description: "Возвращает список тегов компании.",
      inputSchema: {},
    },
    () => run(ctx, () => client.get("/tags"))
  );
}
