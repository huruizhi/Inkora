import type { Node as PMNode } from "prosemirror-model";
import type { NodeView, NodeViewConstructor } from "prosemirror-view";

export type ImageResourceStatus =
  | "ready"
  | "missing"
  | "denied"
  | "unsupported"
  | "error"
  | "pending";

export interface ImageResourceDescriptor {
  readonly href: string;
  readonly status: ImageResourceStatus;
  readonly displayURL?: string;
  readonly message?: string;
}

export type ImageAttributeEdit = (
  getPos: () => number | undefined,
  expectedNode: PMNode,
  attrs: { alt: string; title: string | null },
) => { ok: boolean; message?: string };

const capabilityPattern = /^inkora-asset:\/\/resource\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isExternal(href: string): boolean {
  return /^(?:https?|data|file):/i.test(href);
}

export class ImageResourceRegistry {
  private readonly descriptors = new Map<string, ImageResourceDescriptor>();
  private readonly listeners = new Map<string, Set<() => void>>();

  replace(values: readonly ImageResourceDescriptor[]): void {
    const next = new Map(this.descriptors);
    for (const value of values) next.set(value.href, value);
    const changed = new Set([...next.keys()].filter(href =>
      JSON.stringify(this.descriptors.get(href)) !== JSON.stringify(next.get(href))));
    this.descriptors.clear();
    for (const [href, descriptor] of next) this.descriptors.set(href, descriptor);
    for (const href of changed) for (const listener of this.listeners.get(href) ?? []) listener();
  }

  descriptor(href: string): ImageResourceDescriptor {
    if (isExternal(href)) return { href, status: "error", message: "离线外部图片（保留引用，不下载）" };
    return this.descriptors.get(href) ?? { href, status: "pending" };
  }

  subscribe(href: string, listener: () => void): () => void {
    const listeners = this.listeners.get(href) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(href, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(href);
    };
  }
}

function placeholderText(descriptor: ImageResourceDescriptor): string {
  if (descriptor.message) return descriptor.message;
  switch (descriptor.status) {
  case "missing": return "图片缺失";
  case "denied": return "无权读取图片";
  case "unsupported": return "不支持的图片格式";
  case "error": return "图片无法加载";
  default: return "图片等待授权";
  }
}

class InkoraImageNodeView implements NodeView {
  readonly dom: HTMLElement;
  private node: PMNode;
  private unsubscribe: (() => void) | undefined;
  private editorOpen = false;

  constructor(
    node: PMNode,
    private readonly registry: ImageResourceRegistry,
    private readonly requestAccess?: (href: string) => void,
    private readonly getPos?: () => number | undefined,
    private readonly editAttributes?: ImageAttributeEdit,
  ) {
    this.node = node;
    this.dom = document.createElement("span");
    this.dom.className = "image-node";
    this.dom.setAttribute("contenteditable", "false");
    this.subscribe();
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type.name !== "image") return false;
    const changedHref = node.attrs.href !== this.node.attrs.href;
    this.node = node;
    if (changedHref) this.subscribe();
    this.render();
    return true;
  }

  selectNode(): void { this.dom.classList.add("ProseMirror-selectednode"); }
  deselectNode(): void { this.dom.classList.remove("ProseMirror-selectednode"); }
  stopEvent(event: Event): boolean {
    const HTMLElementType = this.dom.ownerDocument.defaultView?.HTMLElement;
    return !!HTMLElementType && event.target instanceof HTMLElementType &&
      event.target.closest(".image-controls") !== null;
  }
  ignoreMutation(): boolean { return true; }
  destroy(): void { this.unsubscribe?.(); }

  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.registry.subscribe(String(this.node.attrs.href), () => this.render());
  }

  private render(): void {
    const href = String(this.node.attrs.href);
    const descriptor = this.registry.descriptor(href);
    this.dom.replaceChildren();
    this.dom.dataset.imageHref = href;
    this.dom.dataset.imageStatus = descriptor.status;
    this.dom.title = this.node.attrs.title ?? "";
    this.dom.setAttribute("aria-label", this.node.attrs.alt || "本地图片");
    if (descriptor.status === "ready" && descriptor.displayURL && capabilityPattern.test(descriptor.displayURL)) {
      const image = document.createElement("img");
      image.src = descriptor.displayURL;
      image.alt = String(this.node.attrs.alt);
      if (this.node.attrs.title) image.title = String(this.node.attrs.title);
      image.draggable = false;
      this.dom.append(image);
    } else {
      const label = document.createElement("span");
      label.className = `image-placeholder image-placeholder-${descriptor.status}`;
      label.textContent = placeholderText(descriptor);
      this.dom.append(label);
      if (["missing", "denied", "pending"].includes(descriptor.status)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "image-access-button";
        button.textContent = descriptor.status === "missing" ? "定位…" : "授权…";
        button.addEventListener("click", () => this.requestAccess?.(href));
        this.dom.append(button);
      }
    }
    this.renderAttributeEditor();
  }

  private renderAttributeEditor(): void {
    if (!this.getPos || !this.editAttributes) return;
    const controls = document.createElement("span");
    controls.className = "image-controls";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "image-edit-button";
    edit.textContent = "描述…";
    edit.setAttribute("aria-expanded", String(this.editorOpen));
    edit.addEventListener("click", () => {
      this.editorOpen = !this.editorOpen;
      this.render();
      if (this.editorOpen) this.dom.querySelector<HTMLInputElement>('[name="alt"]')?.focus();
    });
    controls.append(edit);
    if (!this.editorOpen) {
      this.dom.append(controls);
      return;
    }

    const form = document.createElement("form");
    form.className = "image-attributes-form";
    const alt = document.createElement("input");
    alt.name = "alt";
    alt.value = String(this.node.attrs.alt);
    alt.placeholder = "图片描述（alt）";
    alt.setAttribute("aria-label", "图片描述");
    const title = document.createElement("input");
    title.name = "title";
    title.value = this.node.attrs.title ?? "";
    title.placeholder = "可选标题";
    title.setAttribute("aria-label", "图片标题");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "应用";
    const error = document.createElement("span");
    error.className = "image-attributes-error";
    error.setAttribute("role", "status");
    form.append(alt, title, save, error);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const result = this.editAttributes?.(this.getPos!, this.node, {
        alt: alt.value,
        title: title.value.length ? title.value : null,
      });
      if (!result?.ok) {
        error.textContent = result?.message ?? "无法安全修改图片描述。";
        return;
      }
      this.editorOpen = false;
      this.render();
    });
    controls.append(form);
    this.dom.append(controls);
  }
}

export function createImageNodeViews(
  registry: ImageResourceRegistry,
  requestAccess?: (href: string) => void,
  editAttributes?: ImageAttributeEdit,
): NodeViewConstructor {
  return (node, _view, getPos) => new InkoraImageNodeView(
    node,
    registry,
    requestAccess,
    typeof getPos === "function" ? getPos : undefined,
    editAttributes,
  );
}
