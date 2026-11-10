import "./image-tools.css";
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
  private alive = true;
  private intentEpoch = 0;
  private formComposing = false;
  private draftPos: number | undefined;
  private draftSelection?: import("prosemirror-state").Selection;
  private readonly resource: HTMLElement;
  private readonly controls: HTMLElement;

  constructor(
    node: PMNode,
    private readonly registry: ImageResourceRegistry,
    private readonly requestAccess?: (href: string) => void,
    private readonly getPos?: () => number | undefined,
    private readonly editAttributes?: ImageAttributeEdit,
    private readonly editorView?: import("prosemirror-view").EditorView,
    private readonly isComposing: () => boolean = () => editorView?.composing === true,
  ) {
    this.node = node;
    this.dom = document.createElement("span");
    this.dom.className = "image-node";
    this.dom.setAttribute("contenteditable", "false");
    this.resource = document.createElement("span");
    this.resource.className = "image-resource";
    this.controls = document.createElement("span");
    this.controls.className = "image-controls";
    this.controls.setAttribute("role", "group");
    this.controls.setAttribute("aria-label", "图片操作");
    this.controls.setAttribute("aria-keyshortcuts", "Alt+F10");
    this.controls.addEventListener("keydown", event => {
      if (event.key !== "Escape" || this.editorOpen || event.isComposing || this.formComposing || this.isComposing()) return;
      event.preventDefault();
      this.editorView?.focus();
    });
    this.dom.append(this.resource, this.controls);
    this.subscribe();
    this.render();
    this.renderAttributeEditor();
  }

  update(node: PMNode): boolean {
    if (node.type.name !== "image") return false;
    const changedHref = node.attrs.href !== this.node.attrs.href;
    const invalidated = this.editorOpen && (!node.eq(this.node) || this.getPos?.() !== this.draftPos);
    if (invalidated) {
      this.editorOpen = false;
      this.formComposing = false;
      this.intentEpoch++;
      this.renderAttributeEditor();
      const message = document.createElement("span");
      message.setAttribute("role", "status");
      message.textContent = "图片或选区已变化，请重新打开描述。";
      this.controls.append(message);
    }
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
  destroy(): void { this.alive = false; this.intentEpoch++; this.unsubscribe?.(); }

  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.registry.subscribe(String(this.node.attrs.href), () => this.render());
  }

  private render(): void {
    const href = String(this.node.attrs.href);
    const descriptor = this.registry.descriptor(href);
    const previousImage = this.resource.querySelector<HTMLImageElement>("img");
    const retainImage = descriptor.status === "ready" && previousImage?.getAttribute("src") === descriptor.displayURL;
    if (!retainImage) {
      this.resource.replaceChildren();
      this.dom.classList.remove("image-decoded");
    }
    this.dom.dataset.imageHref = href;
    this.dom.dataset.imageStatus = descriptor.status;
    this.dom.title = this.node.attrs.title ?? "";
    this.dom.setAttribute("aria-label", this.node.attrs.alt || "本地图片");
    if (descriptor.status === "ready" && descriptor.displayURL && capabilityPattern.test(descriptor.displayURL)) {
      const image = previousImage && retainImage ? previousImage : document.createElement("img");
      const url = descriptor.displayURL;
      if (!retainImage) image.addEventListener("load", () => {
        if (this.alive && image.isConnected && image.naturalWidth > 0) this.dom.classList.add("image-decoded");
      });
      if (!retainImage) image.addEventListener("error", () => {
        if (this.alive && image.isConnected) this.dom.classList.remove("image-decoded");
      });
      if (!retainImage) image.src = url;
      image.alt = String(this.node.attrs.alt);
      image.title = this.node.attrs.title ?? "";
      image.draggable = false;
      if (!retainImage) this.resource.append(image);
    } else {
      const label = document.createElement("span");
      label.className = `image-placeholder image-placeholder-${descriptor.status}`;
      label.textContent = placeholderText(descriptor);
      this.resource.append(label);
      if (["missing", "denied", "pending"].includes(descriptor.status)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "image-access-button";
        button.textContent = descriptor.status === "missing" ? "定位…" : "授权…";
        button.addEventListener("click", () => this.requestAccess?.(href));
        this.resource.append(button);
      }
    }
  }

  private renderAttributeEditor(): void {
    if (!this.getPos || !this.editAttributes) return;
    const controls = this.controls;
    controls.replaceChildren();
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "image-edit-button";
    edit.textContent = "描述…";
    edit.setAttribute("aria-expanded", String(this.editorOpen));
    edit.addEventListener("click", () => {
      if (!this.alive || !edit.isConnected || this.formComposing || this.isComposing()) return;
      this.editorOpen = !this.editorOpen;
      this.draftPos = this.getPos?.();
      this.intentEpoch++;
      this.renderAttributeEditor();
      if (this.editorOpen) {
        const form = this.controls.querySelector<HTMLFormElement>("form")!;
        if (typeof form.showPopover === "function") {
          form.showPopover();
          const anchor = this.dom.getBoundingClientRect();
          const rect = form.getBoundingClientRect();
          const viewport = this.dom.ownerDocument.defaultView!;
          form.style.left = `${Math.max(12, Math.min(anchor.left, viewport.innerWidth - rect.width - 12))}px`;
          form.style.top = `${Math.max(12, Math.min(anchor.bottom + 4, viewport.innerHeight - rect.height - 12))}px`;
        }
        this.dom.querySelector<HTMLInputElement>('[name="alt"]')?.focus();
        this.draftSelection = this.editorView?.state.selection;
      }
    });
    controls.append(edit);
    if (!this.editorOpen) {
      return;
    }

    const expectedNode = this.node;
    const epoch = this.intentEpoch;
    const expectedPos = this.draftPos;
    const valid = (): boolean => this.alive && this.editorOpen && epoch === this.intentEpoch &&
      form.isConnected && this.getPos?.() === expectedPos && this.node.eq(expectedNode) &&
      (!this.draftSelection || this.editorView?.state.selection.eq(this.draftSelection) === true);
    const form = document.createElement("form");
    form.className = "image-attributes-form";
    if (typeof form.showPopover === "function") form.setAttribute("popover", "manual");
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
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.className = "image-attributes-cancel";
    const close = (): void => {
      if (!valid() || this.formComposing || this.isComposing()) return;
      this.editorOpen = false;
      this.intentEpoch++;
      this.renderAttributeEditor();
      this.controls.querySelector<HTMLButtonElement>("button")?.focus();
    };
    cancel.addEventListener("click", close);
    form.addEventListener("compositionstart", () => { this.formComposing = true; });
    form.addEventListener("compositionend", () => { this.formComposing = false; });
    form.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.isComposing || this.formComposing || this.isComposing()) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    form.append(alt, title, save, cancel, error);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!valid() || this.formComposing || this.isComposing()) return;
      const result = this.editAttributes?.(this.getPos!, expectedNode, {
        alt: alt.value,
        title: title.value.length ? title.value : null,
      });
      if (!result?.ok) {
        error.textContent = result?.message ?? "无法安全修改图片描述。";
        return;
      }
      this.editorOpen = false;
      this.intentEpoch++;
      this.renderAttributeEditor();
      this.controls.querySelector<HTMLButtonElement>("button")?.focus();
    });
    controls.append(form);
  }
}

export function createImageNodeViews(
  registry: ImageResourceRegistry,
  requestAccess?: (href: string) => void,
  editAttributes?: ImageAttributeEdit,
  isComposing?: () => boolean,
): NodeViewConstructor {
  return (node, view, getPos) => new InkoraImageNodeView(
    node,
    registry,
    requestAccess,
    typeof getPos === "function" ? getPos : undefined,
    editAttributes,
    view,
    isComposing,
  );
}
