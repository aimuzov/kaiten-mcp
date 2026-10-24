import { registerCardExtraTools } from './card-extras.ts'
import { registerCardTools } from './cards.ts'
import { registerChecklistTools } from './checklists.ts'
import { registerCommentTools } from './comments.ts'
import { registerExternalLinkTools } from './external-links.ts'
import type { ToolContext } from './helpers.ts'
import { registerLookupTools } from './lookups.ts'
import { registerPlanningTools } from './planning.ts'
import { registerSearchTools } from './search.ts'
import { registerSpaceBoardTools } from './spaces-boards.ts'
import { registerTimeLogTools } from './time-logs.ts'
import { registerUserTools } from './users.ts'

/** Регистрирует все инструменты MCP-сервера. */
export function registerAllTools(ctx: ToolContext): void {
	registerUserTools(ctx)
	registerSpaceBoardTools(ctx)
	registerLookupTools(ctx)
	registerCardTools(ctx)
	registerCardExtraTools(ctx)
	registerExternalLinkTools(ctx)
	registerSearchTools(ctx)
	registerCommentTools(ctx)
	registerChecklistTools(ctx)
	registerTimeLogTools(ctx)
	registerPlanningTools(ctx)
}
