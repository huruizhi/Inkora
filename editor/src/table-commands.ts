export type TableAlignment = "none" | "left" | "center" | "right";
export type TableCommandType =
  | "add_row_before"
  | "add_row_after"
  | "delete_row"
  | "add_column_before"
  | "add_column_after"
  | "delete_column"
  | "align_none"
  | "align_left"
  | "align_center"
  | "align_right"
  | "delete_table"
  | "move_row"
  | "move_column"
  | "resize";

export type TableCommandMeta = {
  type: TableCommandType;
  tablePos: number;
  rowIndex: number;
  columnIndex: number;
  alignment?: TableAlignment;
  targetIndex?: number;
  columns?: number;
  rows?: number;
  confirmShrink?: boolean;
};

export type TableSize = { columns: number; rows: number };
export const TABLE_LIMITS = { columns: 20, rows: 100 } as const;
export function validTableSize(size: TableSize): boolean {
  return Number.isInteger(size.columns) && Number.isInteger(size.rows) &&
    size.columns >= 1 && size.columns <= TABLE_LIMITS.columns && size.rows >= 1 && size.rows <= TABLE_LIMITS.rows;
}
