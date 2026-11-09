import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

export type TaskToggleMeta = {
  pos: number;
  checked: boolean;
};

type TaskNodeViewOptions = {
  isComposing: () => boolean;
};

export function createTaskListItemNodeViews(options: TaskNodeViewOptions) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const dom = document.createElement("li");
    let current = node;
    let input: HTMLInputElement | undefined;
    let contentDOM: HTMLElement = dom;

    const renderTaskChrome = (): void => {
      if (!current.attrs.task) return;
      if (!input) {
        input = document.createElement("input");
        input.type = "checkbox";
        input.className = "inkora-task-checkbox";
        input.tabIndex = 0;
        const content = document.createElement("div");
        content.className = "inkora-task-content";
        contentDOM = content;
        dom.append(input, content);
        const toggle = (checked: boolean): void => {
          if (options.isComposing()) {
            input!.checked = Boolean(current.attrs.checked);
            view.focus();
            return;
          }
          const pos = getPos();
          if (pos === undefined) return;
          const active = view.state.doc.nodeAt(pos);
          if (!active || active.type !== current.type || !active.attrs.task) return;
          const meta: TaskToggleMeta = { pos, checked };
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
            ...active.attrs,
            checked,
            stateChar: checked ? "x" : " ",
          }).setMeta("inkoraTaskToggle", meta));
        };
        input.addEventListener("pointerdown", (event) => {
          if (!options.isComposing()) return;
          event.preventDefault();
          view.focus();
        });
        input.addEventListener("click", (event) => {
          event.preventDefault();
          toggle(!Boolean(current.attrs.checked));
        });
        input.addEventListener("keydown", (event) => {
          if (event.key !== " ") return;
          event.preventDefault();
          toggle(!Boolean(current.attrs.checked));
        });
      }
      input.checked = Boolean(current.attrs.checked);
      input.setAttribute("aria-label", `任务：${current.firstChild?.textContent || "未命名任务"}`);
      dom.dataset.taskState = String(current.attrs.stateChar);
    };

    renderTaskChrome();
    return {
      dom,
      contentDOM,
      update(updated) {
        if (updated.type !== current.type || Boolean(updated.attrs.task) !== Boolean(current.attrs.task)) return false;
        current = updated;
        renderTaskChrome();
        return true;
      },
      stopEvent(event) { return input?.contains(event.target as Node) ?? false; },
    };
  };
}
