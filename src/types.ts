/**
 * Лёгкие типы сущностей Kaiten. Намеренно частичные: Kaiten возвращает много
 * полей, мы типизируем только те, что используем, и допускаем остальные через
 * индексную сигнатуру.
 */

export type KaitenEntity = {
	id: number
	[key: string]: unknown
}

export type KaitenUser = {
	full_name?: string
	username?: string
	email?: string
} & KaitenEntity

export type KaitenSpace = {
	title?: string
} & KaitenEntity

export type KaitenColumn = {
	title?: string
	/** Тип колонки Kaiten: 1 — очередь, 2 — в работе, 3 — готово. */
	type?: number
	sort_order?: number
} & KaitenEntity

export type KaitenLane = {
	title?: string
	sort_order?: number
} & KaitenEntity

export type KaitenBoard = {
	title?: string
	space_id?: number
	columns?: KaitenColumn[]
	lanes?: KaitenLane[]
} & KaitenEntity

export type KaitenCard = {
	title?: string
	description?: string
	board_id?: number
	column_id?: number
	lane_id?: number
	space_id?: number
	type_id?: number
	/** Признак архивности/состояния: 1 — активна, 2 — архив. */
	condition?: number
	archived?: boolean
	due_date?: string | null
	/** Срок задан с часами и минутами. Без них `due_date` -- просто календарная дата. */
	due_date_time_present?: boolean
	sort_order?: number
	owner_id?: number
	responsible_id?: number
	members?: KaitenUser[]
	column?: KaitenColumn
	board?: KaitenBoard
	tags?: Array<{ id: number; name?: string }>
} & KaitenEntity
