/**
 * Лёгкие типы сущностей Kaiten. Намеренно частичные: Kaiten возвращает много
 * полей, мы типизируем только те, что используем, и допускаем остальные через
 * индексную сигнатуру.
 */

export interface KaitenEntity {
  id: number;
  [key: string]: unknown;
}

export interface KaitenUser extends KaitenEntity {
  full_name?: string;
  username?: string;
  email?: string;
}

export interface KaitenSpace extends KaitenEntity {
  title?: string;
}

export interface KaitenColumn extends KaitenEntity {
  title?: string;
  /** Тип колонки Kaiten: 1 — очередь, 2 — в работе, 3 — готово. */
  type?: number;
  sort_order?: number;
}

export interface KaitenLane extends KaitenEntity {
  title?: string;
  sort_order?: number;
}

export interface KaitenBoard extends KaitenEntity {
  title?: string;
  space_id?: number;
  columns?: KaitenColumn[];
  lanes?: KaitenLane[];
}

export interface KaitenCard extends KaitenEntity {
  title?: string;
  description?: string;
  board_id?: number;
  column_id?: number;
  lane_id?: number;
  space_id?: number;
  type_id?: number;
  /** Признак архивности/состояния: 1 — активна, 2 — архив. */
  condition?: number;
  archived?: boolean;
  due_date?: string | null;
  sort_order?: number;
  owner_id?: number;
  responsible_id?: number;
  members?: KaitenUser[];
  column?: KaitenColumn;
  board?: KaitenBoard;
  tags?: Array<{ id: number; name?: string }>;
}
