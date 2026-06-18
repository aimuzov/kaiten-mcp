import { z } from "zod";
import { run, type ToolContext } from "./helpers.js";

export function registerSpaceBoardTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "kaiten_list_spaces",
    {
      title: "Список пространств",
      description: "Возвращает все доступные пространства (spaces) Kaiten.",
      inputSchema: {},
    },
    (_args, extra) => run(ctx, extra, (client) => client.listSpaces())
  );

  server.registerTool(
    "kaiten_get_space",
    {
      title: "Пространство",
      description: "Возвращает одно пространство по его ID.",
      inputSchema: {
        space_id: z.number().int().describe("ID пространства"),
      },
    },
    (args, extra) => run(ctx, extra, (client) => client.getSpace(args.space_id))
  );

  server.registerTool(
    "kaiten_list_boards",
    {
      title: "Доски пространства",
      description:
        "Возвращает доски (boards) внутри пространства. Если space_id не указан — " +
        "используется KAITEN_DEFAULT_SPACE_ID (если задан).",
      inputSchema: {
        space_id: z.number().int().optional().describe("ID пространства (по умолчанию из конфига)"),
      },
    },
    (args, extra) =>
      run(ctx, extra, (client) => {
        const spaceId = args.space_id ?? ctx.config.defaultSpaceId;
        if (spaceId === undefined) {
          throw new Error("Не указан space_id и не задан KAITEN_DEFAULT_SPACE_ID");
        }
        return client.listBoards(spaceId);
      })
  );

  server.registerTool(
    "kaiten_get_board",
    {
      title: "Доска",
      description:
        "Возвращает доску по ID. Обычно включает вложенные колонки (columns) и дорожки (lanes).",
      inputSchema: {
        board_id: z.number().int().describe("ID доски"),
      },
    },
    (args, extra) => run(ctx, extra, (client) => client.getBoard(args.board_id))
  );
}
