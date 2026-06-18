import { z } from "zod";
import type { KaitenCard } from "../types.js";
import { compact, run, type ToolContext } from "./helpers.js";

/** Возвращает дату в формате YYYY-MM-DD по локальному времени. */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Извлекает YYYY-MM-DD из значения due_date карточки (ISO или дата). */
function dueDateKey(due: unknown): string | null {
  if (typeof due !== "string" || due.trim() === "") return null;
  // due_date обычно ISO: "2026-06-17T12:00:00.000Z" или "2026-06-17".
  const match = due.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Карточка в колонке типа "готово" (type === 3)? Best-effort, если поле есть. */
function isDoneCard(card: KaitenCard): boolean {
  const columnType = card.column?.type;
  return columnType === 3;
}

interface PlanCard {
  id: number;
  title?: string;
  board_id?: number;
  column_id?: number;
  due_date?: string | null;
  due_date_key: string | null;
  responsible_id?: number;
  owner_id?: number;
  asap?: boolean;
  overdue: boolean;
  due_today: boolean;
}

function toPlanCard(card: KaitenCard, todayKey: string): PlanCard {
  const key = dueDateKey(card.due_date);
  return {
    id: card.id,
    title: card.title,
    board_id: card.board_id,
    column_id: card.column_id,
    due_date: card.due_date ?? null,
    due_date_key: key,
    responsible_id: card.responsible_id,
    owner_id: card.owner_id,
    asap: Boolean(card.asap),
    overdue: key !== null && key < todayKey,
    due_today: key === todayKey,
  };
}

function sortPlanCards(a: PlanCard, b: PlanCard): number {
  // Сначала ASAP, затем по сроку (раньше — выше), карточки без срока в конце.
  if (a.asap !== b.asap) return a.asap ? -1 : 1;
  const ak = a.due_date_key ?? "9999-99-99";
  const bk = b.due_date_key ?? "9999-99-99";
  return ak < bk ? -1 : ak > bk ? 1 : a.id - b.id;
}

const baseFilterShape = {
  user_id: z
    .number()
    .int()
    .optional()
    .describe("ID пользователя. Если не указан — берётся текущий пользователь токена."),
  space_id: z.number().int().optional().describe("Ограничить пространством"),
  board_id: z.number().int().optional().describe("Ограничить доской"),
  role: z
    .enum(["responsible", "owner", "member"])
    .optional()
    .describe("Роль пользователя в карточке (по умолч. responsible)"),
  limit: z.number().int().positive().max(1000).optional().describe("Лимит выборки (по умолч. 500)"),
} as const;

async function resolveUserId(ctx: ToolContext, userId?: number): Promise<number> {
  if (userId !== undefined) return userId;
  const me = await ctx.client.getCurrentUser();
  return me.id;
}

async function fetchUserCards(
  ctx: ToolContext,
  opts: { user_id?: number; space_id?: number; board_id?: number; role?: string; limit?: number }
): Promise<KaitenCard[]> {
  const userId = await resolveUserId(ctx, opts.user_id);
  const role = opts.role ?? "responsible";
  const params: Record<string, unknown> = compact({
    space_id: opts.space_id,
    board_id: opts.board_id,
    condition: 1, // только активные
    limit: opts.limit ?? 500,
  });
  if (role === "owner") params.owner_id = userId;
  else if (role === "member") params.member_ids = String(userId);
  else params.responsible_id = userId;

  return ctx.client.listCards(params);
}

export function registerPlanningTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "kaiten_today_tasks",
    {
      title: "Задачи на сегодня",
      description:
        "Возвращает активные карточки пользователя со сроком на сегодня или раньше " +
        "(по умолчанию включая просроченные). Исключает карточки в колонках типа 'готово'. " +
        "Отсортировано: сначала ASAP, затем по сроку.",
      inputSchema: {
        ...baseFilterShape,
        as_of_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Опорная дата 'сегодня' в формате YYYY-MM-DD (по умолч. текущая)"),
        include_overdue: z.boolean().optional().describe("Включать просроченные (по умолч. true)"),
      },
    },
    (args) =>
      run(ctx, async () => {
        const todayKey = args.as_of_date ?? localDateKey(new Date());
        const includeOverdue = args.include_overdue ?? true;
        const cards = await fetchUserCards(ctx, args);
        const plan = cards
          .filter((c) => !isDoneCard(c))
          .map((c) => toPlanCard(c, todayKey))
          .filter((c) => {
            if (c.due_date_key === null) return false;
            if (c.due_date_key === todayKey) return true;
            return includeOverdue && c.overdue;
          })
          .sort(sortPlanCards);

        return {
          as_of_date: todayKey,
          total: plan.length,
          overdue_count: plan.filter((c) => c.overdue).length,
          due_today_count: plan.filter((c) => c.due_today).length,
          cards: plan,
        };
      })
  );

  server.registerTool(
    "kaiten_overdue_cards",
    {
      title: "Просроченные карточки",
      description:
        "Возвращает активные карточки пользователя, срок которых уже прошёл (строго раньше сегодня).",
      inputSchema: {
        ...baseFilterShape,
        as_of_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Опорная дата в формате YYYY-MM-DD (по умолч. текущая)"),
      },
    },
    (args) =>
      run(ctx, async () => {
        const todayKey = args.as_of_date ?? localDateKey(new Date());
        const cards = await fetchUserCards(ctx, args);
        const overdue = cards
          .filter((c) => !isDoneCard(c))
          .map((c) => toPlanCard(c, todayKey))
          .filter((c) => c.overdue)
          .sort(sortPlanCards);
        return { as_of_date: todayKey, total: overdue.length, cards: overdue };
      })
  );

  server.registerTool(
    "kaiten_plan_day",
    {
      title: "План на день",
      description:
        "Строит готовый план дня из карточек пользователя: группирует на 'Просрочено' и " +
        "'На сегодня', сортирует по приоритету и сроку, и возвращает готовый markdown-текст " +
        "плюс структурированный список карточек.",
      inputSchema: {
        ...baseFilterShape,
        as_of_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Опорная дата в формате YYYY-MM-DD (по умолч. текущая)"),
      },
    },
    (args) =>
      run(ctx, async () => {
        const todayKey = args.as_of_date ?? localDateKey(new Date());
        const cards = await fetchUserCards(ctx, args);
        const relevant = cards
          .filter((c) => !isDoneCard(c))
          .map((c) => toPlanCard(c, todayKey))
          .filter((c) => c.due_date_key !== null && c.due_date_key <= todayKey)
          .sort(sortPlanCards);

        const overdue = relevant.filter((c) => c.overdue);
        const today = relevant.filter((c) => c.due_today);

        const fmt = (c: PlanCard) => {
          const flag = c.asap ? "ASAP " : "";
          const due = c.due_date_key ? ` (срок: ${c.due_date_key})` : "";
          return `- ${flag}[#${c.id}] ${c.title ?? "(без названия)"}${due}`;
        };

        const lines: string[] = [`# План на ${todayKey}`, ""];
        if (overdue.length) {
          lines.push(`## Просрочено (${overdue.length})`, ...overdue.map(fmt), "");
        }
        lines.push(`## На сегодня (${today.length})`);
        lines.push(...(today.length ? today.map(fmt) : ["- Нет карточек со сроком на сегодня"]));
        if (!overdue.length && !today.length) {
          lines.push("", "Нечего планировать: задач со сроком на сегодня и просроченных нет.");
        }

        return {
          as_of_date: todayKey,
          plan_markdown: lines.join("\n"),
          overdue,
          due_today: today,
        };
      })
  );
}
