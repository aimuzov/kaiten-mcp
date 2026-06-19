import type { ToolContext } from './helpers.js'
import { registerCardTools } from './cards.js'
import { registerCardExtraTools } from './card-extras.js'
import { registerChecklistTools } from './checklists.js'
import { registerCommentTools } from './comments.js'
import { registerLookupTools } from './lookups.js'
import { registerPlanningTools } from './planning.js'
import { registerSearchTools } from './search.js'
import { registerSpaceBoardTools } from './spaces-boards.js'
import { registerTimeLogTools } from './time-logs.js'
import { registerUserTools } from './users.js'

/** Регистрирует все инструменты MCP-сервера. */
export function registerAllTools(ctx: ToolContext): void {
	registerUserTools(ctx)
	registerSpaceBoardTools(ctx)
	registerLookupTools(ctx)
	registerCardTools(ctx)
	registerCardExtraTools(ctx)
	registerSearchTools(ctx)
	registerCommentTools(ctx)
	registerChecklistTools(ctx)
	registerTimeLogTools(ctx)
	registerPlanningTools(ctx)
}
