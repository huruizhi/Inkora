import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { applyTableCommand } from './table-editing';
import { openTableSizeDialog } from './table-size-dialog';
import './table-interactions.css';

type Options = { view: EditorView; shell: HTMLElement; toolbar: HTMLElement; scroll: HTMLElement;
  table: HTMLTableElement; getPos: () => number | undefined; isComposing: () => boolean };

/** Drag previews stay outside contentDOM. Only a verified drop crosses the command seam. */
export function bindTableInteractions(options: Options) {
  const { view, shell, toolbar, scroll, table, getPos, isComposing } = options;
  const doc = shell.ownerDocument;
  const win = doc.defaultView!;
  const handles = doc.createElement('div'); handles.className = 'inkora-table-handles'; handles.contentEditable = 'false';
  const shade = doc.createElement('div'); shade.className = 'table-drag-shade'; shade.hidden = true;
  const indicator = doc.createElement('div'); indicator.className = 'table-drop-indicator'; indicator.hidden = true;
  handles.append(shade, indicator); scroll.append(handles);
  const resize = doc.createElement('button'); resize.type = 'button'; resize.textContent = '规模';
  resize.setAttribute('aria-label', '调整表格规模'); toolbar.append(resize);
  let alive = true;
  let current: PMNode;
  let closeDialog: (() => void) | undefined;
  let drag: { axis: 'row' | 'column'; index: number; target: number; state: typeof view.state; pointer: number; handle: HTMLElement } | undefined;
  const valid = () => alive && shell.isConnected && !view.isDestroyed && view.editable && !isComposing() && !view.composing;
  const rect = (node: Element) => node.getBoundingClientRect();
  const local = (box: DOMRect) => {
    const outer = rect(scroll);
    return { x: box.left - outer.left + scroll.scrollLeft, y: box.top - outer.top + scroll.scrollTop };
  };
  const cancel = () => {
    const previous = drag; drag = undefined;
    if (previous?.handle.hasPointerCapture?.(previous.pointer)) previous.handle.releasePointerCapture(previous.pointer);
    shade.hidden = indicator.hidden = true; shell.classList.remove('table-dragging');
    doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', drop, true);
    doc.removeEventListener('pointercancel', cancel, true); doc.removeEventListener('keydown', key, true);
    win.removeEventListener('blur', cancel);
  };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); cancel(); } };
  const commit = (axis: 'row' | 'column', from: number, to: number) => {
    const pos = getPos();
    if (!valid() || pos === undefined) return false;
    const result = applyTableCommand(view, pos, axis === 'row' ? 'move_row' : 'move_column',
      axis === 'row' ? { rowIndex: from, targetIndex: to } : { columnIndex: from, targetIndex: to });
    view.focus(); return result;
  };
  const targets = (axis: 'row' | 'column') => axis === 'row' ? Array.from(table.rows) : Array.from(table.rows[0]?.cells ?? []);
  const feedback = () => {
    if (!drag) return;
    const entries = targets(drag.axis);
    const source = entries[drag.index]; const target = entries[drag.target];
    if (!source || !target) { cancel(); return; }
    const bounds = rect(table); const sourceBounds = rect(source); const targetBounds = rect(target);
    const tablePoint = local(bounds); const sourcePoint = local(sourceBounds); const targetPoint = local(targetBounds);
    const row = drag.axis === 'row';
    shade.hidden = indicator.hidden = false;
    Object.assign(shade.style, { left: `${row ? tablePoint.x : sourcePoint.x}px`, top: `${row ? sourcePoint.y : tablePoint.y}px`,
      width: `${row ? bounds.width : sourceBounds.width}px`, height: `${row ? sourceBounds.height : bounds.height}px` });
    const after = drag.target > drag.index;
    Object.assign(indicator.style, { left: `${row ? tablePoint.x : targetPoint.x + (after ? targetBounds.width : 0)}px`,
      top: `${row ? targetPoint.y + (after ? targetBounds.height : 0) : tablePoint.y}px`,
      width: `${row ? bounds.width : 3}px`, height: `${row ? 3 : bounds.height}px` });
    indicator.dataset.targetIndex = String(drag.target);
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!valid() || drag.state !== view.state) { cancel(); return; }
    event.preventDefault();
    const entries = targets(drag.axis);
    const coordinate = drag.axis === 'row' ? event.clientY : event.clientX;
    let nearest = drag.index; let distance = Infinity;
    entries.forEach((element, index) => {
      if (drag!.axis === 'row' && index === 0) return;
      const box = rect(element); const center = drag!.axis === 'row' ? box.top + box.height / 2 : box.left + box.width / 2;
      if (Math.abs(center - coordinate) < distance) { distance = Math.abs(center - coordinate); nearest = index; }
    });
    drag.target = nearest;
    const outer = rect(scroll);
    if (event.clientX < outer.left + 24) scroll.scrollLeft -= 18;
    else if (event.clientX > outer.right - 24) scroll.scrollLeft += 18;
    if (event.clientY < 24) win.scrollBy?.(0, -18);
    else if (event.clientY > win.innerHeight - 24) win.scrollBy?.(0, 18);
    feedback();
  };
  const drop = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    event.preventDefault();
    const intent = drag;
    const accepted = valid() && view.state === intent.state;
    cancel();
    if (accepted && intent.index !== intent.target) commit(intent.axis, intent.index, intent.target);
  };
  const layout = () => {
    if (!alive || !shell.isConnected) return;
    for (const handle of handles.querySelectorAll<HTMLButtonElement>('button')) {
      const axis = handle.dataset.tableAxis as 'row' | 'column';
      const target = targets(axis)[Number(handle.dataset.tableIndex)];
      if (!target) continue;
      const box = rect(target); const point = local(box);
      const tablePoint = local(rect(table));
      handle.style.left = `${axis === 'row' ? tablePoint.x - 20 : point.x + box.width / 2 - 9}px`;
      handle.style.top = `${axis === 'row' ? point.y + box.height / 2 - 9 : tablePoint.y - 20}px`;
    }
    feedback();
  };
  let layoutTimer: number | undefined;
  const frame = () => {
    if (layoutTimer !== undefined) return;
    layoutTimer = win.setTimeout(() => { layoutTimer = undefined; layout(); }, 0);
  };
  const rebuild = (node: PMNode) => {
    current = node; cancel(); closeDialog?.(); closeDialog = undefined;
    handles.querySelectorAll('button').forEach(button => button.remove());
    const counts = { column: node.firstChild?.firstChild?.childCount ?? 0,
      row: 1 + (node.lastChild?.type.name === 'table_body' ? node.lastChild.childCount : 0) };
    for (const axis of ['column', 'row'] as const) for (let index = axis === 'row' ? 1 : 0; index < counts[axis]; index++) {
      const handle = doc.createElement('button'); handle.type = 'button'; handle.textContent = axis === 'row' ? '↕' : '↔';
      handle.className = 'table-reorder-handle'; handle.dataset.tableAxis = axis; handle.dataset.tableIndex = String(index);
      handle.setAttribute('aria-label', `移动第 ${index + 1} ${axis === 'row' ? '行' : '列'}（方向键重排）`);
      handle.title = `${axis === 'row' ? '拖动行；↑↓重排' : '拖动列；←→重排'}`;
      handle.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (!valid() || !handle.isConnected || event.button !== 0) return;
        cancel();
        drag = { axis, index, target: index, state: view.state, pointer: event.pointerId, handle };
        shell.classList.add('table-dragging');
        // Synthetic DOM events have no active platform pointer to capture.
        if (event.isTrusted) handle.setPointerCapture?.(event.pointerId);
        doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', drop, true);
        doc.addEventListener('pointercancel', cancel, true); doc.addEventListener('keydown', key, true);
        win.addEventListener('blur', cancel); feedback();
      });
      handle.addEventListener('keydown', event => {
        if (event.isComposing || !valid() || !handle.isConnected) return;
        const keys = axis === 'row' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const target = index + (event.key === keys[0] ? -1 : 1);
        if (commit(axis, index, target)) handles.querySelector<HTMLButtonElement>(
          `[data-table-axis="${axis}"][data-table-index="${target}"]`)?.focus({ preventScroll: true });
      });
      handles.append(handle);
    }
    frame();
  };
  resize.addEventListener('pointerdown', event => event.preventDefault());
  resize.addEventListener('click', () => {
    if (!valid() || closeDialog) return;
    const binding = view.state;
    const initial = { columns: current.firstChild!.firstChild!.childCount,
      rows: 1 + (current.lastChild?.type.name === 'table_body' ? current.lastChild.childCount : 0) };
    closeDialog = openTableSizeDialog(shell, { title: '调整表格规模', initial, grid: true,
      isCurrent: () => valid() && view.state === binding,
      apply: (size, confirmShrink) => {
        const pos = getPos();
        return pos !== undefined && applyTableCommand(view, pos, 'resize', { ...size, confirmShrink });
      },
      closed: () => { closeDialog = undefined; if (!view.isDestroyed) view.focus(); },
    });
  });
  const abort = () => { cancel(); closeDialog?.(); };
  view.dom.addEventListener('compositionstart', abort, true);
  scroll.addEventListener('scroll', frame); win.addEventListener('resize', frame);
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(frame) : undefined;
  observer?.observe(table);
  return {
    update: rebuild,
    contains: (target: Node) => handles.contains(target) || resize.contains(target) || !!shell.querySelector('dialog')?.contains(target),
    destroy() { alive = false; abort(); if (layoutTimer !== undefined) win.clearTimeout(layoutTimer); observer?.disconnect(); handles.remove();
      view.dom.removeEventListener('compositionstart', abort, true); scroll.removeEventListener('scroll', frame); win.removeEventListener('resize', frame); },
  };
}
