import { TABLE_LIMITS, validTableSize, type TableSize } from './table-commands';
import './table-size-dialog.css';

type Options = {
  title: string;
  initial: TableSize;
  grid?: boolean;
  isCurrent: () => boolean;
  apply: (size: TableSize, confirmShrink: boolean) => boolean;
  closed: () => void;
};

/** A local UI intent. It never owns document content or mutates until Apply. */
export function openTableSizeDialog(parent: HTMLElement, options: Options): () => void {
  const doc = parent.ownerDocument;
  const dialog = doc.createElement('dialog');
  dialog.className = 'inkora-table-size-dialog';
  dialog.contentEditable = 'false';
  dialog.setAttribute('aria-label', options.title);
  const form = doc.createElement('form');
  const title = doc.createElement('h2');
  title.textContent = options.title;
  const fields = doc.createElement('div');
  fields.className = 'table-size-fields';
  const input = (label: string, name: string, value: number, max: number) => {
    const wrapper = doc.createElement('label');
    wrapper.textContent = label;
    const field = doc.createElement('input');
    field.type = 'number'; field.name = name; field.min = '1'; field.max = String(max);
    field.step = '1'; field.value = String(value); field.required = true;
    field.setAttribute('aria-label', label);
    wrapper.append(field); fields.append(wrapper);
    return field;
  };
  const columns = input('列数', 'columns', options.initial.columns, TABLE_LIMITS.columns);
  const rows = input('总行数（含表头）', 'rows', options.initial.rows, TABLE_LIMITS.rows);
  const preview = doc.createElement('output');
  preview.setAttribute('aria-live', 'polite');
  const warning = doc.createElement('label');
  warning.className = 'table-shrink-warning';
  const confirm = doc.createElement('input'); confirm.type = 'checkbox'; confirm.name = 'confirmShrink';
  confirm.setAttribute('aria-label', '确认删除缩减范围内的内容');
  warning.append(confirm, '缩减会删除被移除行列的内容（含未显示的源码格）。确认删除。');
  const error = doc.createElement('p'); error.setAttribute('role', 'status');
  const apply = doc.createElement('button'); apply.type = 'submit'; apply.textContent = '确认';
  const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
  const actions = doc.createElement('div'); actions.className = 'table-size-actions'; actions.append(cancel, apply);
  let closed = false;
  let composing = false;
  const dispose = () => {
    if (closed) return;
    closed = true;
    observer.disconnect();
    dialog.remove();
    options.closed();
  };
  const size = (): TableSize => ({ columns: Number(columns.value), rows: Number(rows.value) });
  const shrinking = () => size().columns < options.initial.columns || size().rows < options.initial.rows;
  const cells: HTMLButtonElement[] = [];
  const refresh = () => {
    const current = size();
    preview.textContent = `${current.columns} 列 × ${current.rows} 行（含表头）`;
    warning.hidden = !options.grid || !shrinking();
    apply.disabled = !validTableSize(current) || options.grid === true && shrinking() && !confirm.checked;
    for (const cell of cells) {
      cell.setAttribute('aria-selected', String(Number(cell.dataset.column) <= current.columns && Number(cell.dataset.row) <= current.rows));
      cell.tabIndex = Number(cell.dataset.column) === Math.min(current.columns, 10) &&
        Number(cell.dataset.row) === Math.min(current.rows, 10) ? 0 : -1;
    }
  };
  form.append(title, fields, preview);
  if (options.grid) {
    const grid = doc.createElement('div'); grid.className = 'table-size-grid'; grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', '选择表格规模');
    for (let row = 1; row <= 10; row++) {
      const line = doc.createElement('div'); line.setAttribute('role', 'row');
      for (let column = 1; column <= 10; column++) {
        const cell = doc.createElement('button'); cell.type = 'button'; cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `${column} 列 ${row} 行`);
        cell.dataset.column = String(column); cell.dataset.row = String(row);
        const choose = () => {
          if (composing) return;
          columns.value = String(column); rows.value = String(row); confirm.checked = false; refresh();
        };
        cell.addEventListener('pointerenter', choose);
        cell.addEventListener('click', () => { choose(); if (!shrinking()) form.requestSubmit(); else confirm.focus(); });
        cell.addEventListener('keydown', event => {
          if (event.isComposing || composing) return;
          const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (!delta[event.key]) return;
          event.preventDefault();
          const [dx, dy] = delta[event.key];
          const next = cells.find(item => Number(item.dataset.column) === Math.max(1, Math.min(10, column + dx)) &&
            Number(item.dataset.row) === Math.max(1, Math.min(10, row + dy)))!;
          columns.value = next.dataset.column!; rows.value = next.dataset.row!; confirm.checked = false;
          refresh(); next.focus();
        });
        cells.push(cell); line.append(cell);
      }
      grid.append(line);
    }
    form.append(grid);
  }
  const observer = new doc.defaultView!.MutationObserver(() => { if (!composing && !options.isCurrent()) dispose(); });
  form.append(warning, error, actions); dialog.append(form); parent.append(dialog);
  observer.observe(parent, { childList: true, subtree: true });
  columns.addEventListener('input', () => { confirm.checked = false; refresh(); });
  rows.addEventListener('input', () => { confirm.checked = false; refresh(); });
  confirm.addEventListener('change', refresh);
  dialog.addEventListener('compositionstart', () => { composing = true; });
  dialog.addEventListener('compositionend', () => { composing = false; if (!options.isCurrent()) dispose(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!composing) dispose(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !composing) { event.preventDefault(); dispose(); }
  });
  cancel.addEventListener('click', () => { if (!composing) dispose(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing) return;
    if (!options.isCurrent()) { dispose(); return; }
    if (!validTableSize(size()) || options.grid && shrinking() && !confirm.checked) return;
    if (options.apply(size(), confirm.checked)) dispose();
    else error.textContent = '无法安全修改表格，请取消后重新选择。';
  });
  refresh();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  columns.focus(); columns.select();
  return dispose;
}
