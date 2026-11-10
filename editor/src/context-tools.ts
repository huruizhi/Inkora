import type { EditorState } from "prosemirror-state";
import { Decoration, type EditorView } from "prosemirror-view";

export function focusContextToolbar(view: EditorView): boolean {
  const target = view.dom.querySelector<HTMLElement>(
    ".inkora-context-active > [role='toolbar'] button:not(:disabled), " +
    ".inkora-context-active > [role='toolbar'] select:not(:disabled)",
  );
  if (!target) return false;
  target.focus();
  return true;
}

export function bindContextToolbar(
  toolbar: HTMLElement, view: EditorView, isComposing: () => boolean,
): void {
  toolbar.setAttribute("aria-keyshortcuts", "Alt+F10");
  toolbar.title = "Option+F10 进入操作工具；Esc 返回正文";
  toolbar.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing || isComposing()) return;
    event.preventDefault();
    view.focus();
  });
}

/** 选区只派生界面装饰，不写入文档、历史或 composition 状态。 */
export function contextToolDecorations(state: EditorState): Decoration[] {
  const positions = new Set<number>();
  const { from, to, $from } = state.selection;
  for (let depth = 1; depth <= $from.depth; depth++) {
    if (["table", "code_block"].includes($from.node(depth).type.name)) {
      positions.add($from.before(depth));
    }
  }
  if (from !== to) {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (["table", "code_block"].includes(node.type.name)) positions.add(pos);
    });
  }
  return Array.from(positions, pos => Decoration.node(
    pos, pos + state.doc.nodeAt(pos)!.nodeSize, { class: "inkora-context-active" },
  ));
}
