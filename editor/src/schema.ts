import { protectedPreview } from "./protected-preview";
import {
  type DOMOutputSpec,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type MarkSpec,
  Schema,
  type TagParseRule,
} from "prosemirror-model";
import {
  bulletList as baseBulletList,
  listItem as baseListItem,
  orderedList as baseOrderedList,
} from "prosemirror-schema-list";

export type InkoraNodeName =
  | "protected_block"
  | "doc"
  | "paragraph"
  | "heading"
  | "text"
  | "hard_break"
  | "horizontal_rule"
  | "blockquote"
  | "code_block"
  | "table"
  | "table_head"
  | "table_body"
  | "table_row"
  | "table_header"
  | "table_cell"
  | "ordered_list"
  | "bullet_list"
  | "list_item";

export type InkoraMarkName = "strong" | "em" | "strike" | "code" | "link" | "image_ref";

export type DocumentRecoveryReason = "empty_input" | "invalid_document";

export interface DocumentLoadResult {
  document: ProseMirrorNode;
  recovered: boolean;
  reason?: DocumentRecoveryReason;
}

const headingLevels = [1, 2, 3, 4, 5, 6] as const;

function validateHeadingLevel(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 6
  ) {
    throw new RangeError("Heading level must be an integer from 1 through 6");
  }
}

function headingToDOM(node: ProseMirrorNode): DOMOutputSpec {
  validateHeadingLevel(node.attrs.level);
  return [`h${node.attrs.level}`, 0];
}

function validateLinkHref(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RangeError("Link href must be a non-empty string");
  }
}

function validateLinkTitle(value: unknown): asserts value is string | null {
  if (value !== null && typeof value !== "string") {
    throw new RangeError("Link title must be a string or null");
  }
}

function validateListOrder(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RangeError("Ordered list start must be a positive integer");
  }
}

function validateOneOf(name: string, allowed: readonly string[]) {
  return (value: unknown): void => {
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw new RangeError(`${name} must be one of: ${allowed.join(", ")}`);
    }
  };
}

const validateHeadingStyle = validateOneOf("Heading style", ["atx", "setext"]);
const validateCodeStyle = validateOneOf("Code block style", ["fenced", "indented"]);
const validateOrderedDelimiter = validateOneOf("Ordered list delimiter", [".", ")"]);
const validateBullet = validateOneOf("Bullet marker", ["-", "+", "*"]);
const validateTableAlignment = validateOneOf("Table alignment", ["none", "left", "center", "right"]);

function linkAttrsFromDOM(dom: Node | string): false | { href: string; title: string | null } {
  if (typeof dom === "string") return false;
  const element = dom as HTMLElement;
  const href = element.getAttribute?.("href");
  if (!href) return false;
  return {
    href,
    title: element.getAttribute("title"),
  };
}

function codeBlockAttrsFromDOM(dom: Node | string): { language: string | null } {
  if (typeof dom === "string") return { language: null };
  const code = (dom as HTMLElement).querySelector?.("code");
  return { language: code?.getAttribute("data-language") ?? null };
}

function tableAlignmentFromStyle(value: string | null): "none" | "left" | "center" | "right" {
  const match = value?.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right)\s*(?:;|$)/i);
  return (match?.[1]?.toLowerCase() as "left" | "center" | "right" | undefined) ?? "none";
}

function tableCellAttrsFromDOM(dom: Node | string): { alignment: string } {
  return {
    alignment: typeof dom === "string"
      ? "none"
      : tableAlignmentFromStyle((dom as HTMLElement).getAttribute("style")),
  };
}

function tableCellDOM(tag: "th" | "td", node: ProseMirrorNode): DOMOutputSpec {
  const alignment = node.attrs.alignment;
  validateTableAlignment(alignment);
  return [tag, alignment === "none" ? {} : { style: `text-align: ${alignment}` }, 0];
}

function tableHeaderToDOM(node: ProseMirrorNode): DOMOutputSpec {
  return tableCellDOM("th", node);
}

function tableCellToDOM(node: ProseMirrorNode): DOMOutputSpec {
  return tableCellDOM("td", node);
}

const headingParseRules: TagParseRule[] = headingLevels.map((level) => ({
  tag: `h${level}`,
  attrs: { level },
}));

export const inkoraNodeSpecs: Record<InkoraNodeName, NodeSpec> = {
  doc: {
    content: "block+",
  },
  paragraph: {
    // DOM changes must retain Markdown soft breaks instead of collapsing to spaces.
    whitespace: "pre",
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM: (): DOMOutputSpec => ["p", 0],
  },
  heading: {
    whitespace: "pre",
    attrs: {
      level: {
        default: 1,
        validate: validateHeadingLevel,
      },
      style: {
        default: "atx",
        validate: validateHeadingStyle,
      },
    },
    content: "inline*",
    defining: true,
    group: "block",
    parseDOM: headingParseRules.map((rule) => ({
      ...rule,
      attrs: { ...rule.attrs, style: "atx" },
    })),
    toDOM: headingToDOM,
  },
  text: {
    group: "inline",
  },
  hard_break: {
    group: "inline",
    inline: true,
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: (): DOMOutputSpec => ["br"],
  },
  horizontal_rule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM: (): DOMOutputSpec => ["hr"],
  },
  blockquote: {
    content: "block+",
    defining: true,
    group: "block",
    parseDOM: [{ tag: "blockquote" }],
    toDOM: (): DOMOutputSpec => ["blockquote", 0],
  },
  code_block: {
    attrs: {
      language: { default: null, validate: "string|null" },
      style: { default: "fenced", validate: validateCodeStyle },
      fence: { default: "```", validate: "string" },
      closed: { default: true, validate: "boolean" },
    },
    code: true,
    content: "text*",
    defining: true,
    group: "block",
    marks: "",
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: codeBlockAttrsFromDOM,
      },
    ],
    toDOM: (node): DOMOutputSpec => [
      "pre",
      [
        "code",
        node.attrs.language ? { "data-language": node.attrs.language } : {},
        0,
      ],
    ],
  },
  table: {
    content: "table_head table_body?",
    group: "block",
    isolating: true,
    parseDOM: [{ tag: "table" }],
    toDOM: (): DOMOutputSpec => ["table", { class: "inkora-table" }, 0],
  },
  table_head: {
    content: "table_row",
    parseDOM: [{ tag: "thead" }],
    toDOM: (): DOMOutputSpec => ["thead", 0],
  },
  table_body: {
    content: "table_row*",
    parseDOM: [{ tag: "tbody" }],
    toDOM: (): DOMOutputSpec => ["tbody", 0],
  },
  table_row: {
    content: "(table_header | table_cell)+",
    parseDOM: [{ tag: "tr" }],
    toDOM: (): DOMOutputSpec => ["tr", 0],
  },
  table_header: {
    attrs: { alignment: { default: "none", validate: validateTableAlignment } },
    content: "inline*",
    isolating: true,
    marks: "_",
    parseDOM: [{ tag: "th", getAttrs: tableCellAttrsFromDOM }],
    toDOM: tableHeaderToDOM,
  },
  table_cell: {
    attrs: { alignment: { default: "none", validate: validateTableAlignment } },
    content: "inline*",
    isolating: true,
    marks: "_",
    parseDOM: [{ tag: "td", getAttrs: tableCellAttrsFromDOM }],
    toDOM: tableCellToDOM,
  },
  ordered_list: {
    ...baseOrderedList,
    attrs: {
      order: { default: 1, validate: validateListOrder },
      delimiter: { default: ".", validate: validateOrderedDelimiter },
      tight: { default: true, validate: "boolean" },
    },
    content: "list_item+",
    group: "block",
  },
  bullet_list: {
    ...baseBulletList,
    attrs: {
      bullet: { default: "-", validate: validateBullet },
      tight: { default: true, validate: "boolean" },
    },
    content: "list_item+",
    group: "block",
  },
  list_item: {
    ...baseListItem,
    attrs: {
      task: { default: false, validate: "boolean" },
      checked: { default: false, validate: "boolean" },
      stateChar: { default: " ", validate: "string" },
    },
    content: "paragraph block*",
    parseDOM: [{
      tag: "li",
      getAttrs: (dom) => {
        const state = (dom as HTMLElement).dataset.taskState;
        return state === undefined
          ? { task: false, checked: false, stateChar: " " }
          : { task: true, checked: state.toLowerCase() === "x", stateChar: state };
      },
    }],
    toDOM: (node): DOMOutputSpec => [
      "li",
      node.attrs.task ? { "data-task-state": node.attrs.stateChar } : {},
      0,
    ],
  },
  protected_block: {
    group: "block",
    atom: true,
    isolating: true,
    attrs: { raw: { validate: "string" }, kind: { validate: "string" } },
    parseDOM: [{
      tag: "section[data-inkora-raw][data-inkora-kind]",
      getAttrs: (dom) => ({
        raw: (dom as HTMLElement).dataset.inkoraRaw,
        kind: (dom as HTMLElement).dataset.inkoraKind,
      }),
    }],
    toDOM: (node) => protectedPreview(node.attrs.raw, node.attrs.kind),
  },

};

export const inkoraMarkSpecs: Record<InkoraMarkName, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
    toDOM: (): DOMOutputSpec => ["strong", 0],
  },
  em: {
    parseDOM: [{ tag: "em" }, { tag: "i" }],
    toDOM: (): DOMOutputSpec => ["em", 0],
  },
  strike: {
    parseDOM: [{ tag: "del" }, { tag: "s" }, { tag: "strike" }],
    toDOM: (): DOMOutputSpec => ["del", 0],
  },
  code: {
    code: true,
    excludes: "_",
    parseDOM: [{ tag: "code" }],
    toDOM: (): DOMOutputSpec => ["code", 0],
  },
  link: {
    attrs: {
      href: { validate: validateLinkHref },
      title: { default: null, validate: validateLinkTitle },
    },
    inclusive: false,
    parseDOM: [{ tag: "a[href]", getAttrs: linkAttrsFromDOM }],
    toDOM: (mark): DOMOutputSpec => {
      validateLinkHref(mark.attrs.href);
      validateLinkTitle(mark.attrs.title);
      return [
        "a",
        { href: mark.attrs.href, title: mark.attrs.title },
        0,
      ];
    },
  },
  image_ref: {
    attrs: {
      href: { validate: validateLinkHref },
      title: { default: null, validate: validateLinkTitle },
    },
    inclusive: false,
    parseDOM: [{
      tag: "span[data-image-ref]",
      getAttrs: (dom) => {
        const element = dom as HTMLElement;
        const href = element.dataset.imageRef;
        if (!href) return false;
        return { href, title: element.getAttribute("title") };
      },
    }],
    toDOM: (mark): DOMOutputSpec => [
      "span",
      {
        class: "image-ref",
        "data-image-ref": mark.attrs.href,
        title: mark.attrs.title ?? undefined,
      },
      0,
    ],
  },
};

export const inkoraSchema = new Schema<InkoraNodeName, InkoraMarkName>({
  nodes: inkoraNodeSpecs,
  marks: inkoraMarkSpecs,
});

export function createEmptyDocument(): ProseMirrorNode {
  const document = inkoraSchema.topNodeType.createAndFill();
  if (!document) {
    throw new Error("Inkora schema cannot create an empty document");
  }
  document.check();
  return document;
}

export function documentFromJSON(value: unknown): ProseMirrorNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RangeError("Document JSON must be an object");
  }

  const document = inkoraSchema.nodeFromJSON(value);
  if (document.type !== inkoraSchema.topNodeType) {
    throw new RangeError("Document JSON must have a doc root");
  }
  document.check();
  return document;
}

export function loadDocumentJSON(value: unknown): DocumentLoadResult {
  if (value === undefined || value === null) {
    return {
      document: createEmptyDocument(),
      recovered: true,
      reason: "empty_input",
    };
  }

  try {
    return {
      document: documentFromJSON(value),
      recovered: false,
    };
  } catch {
    return {
      document: createEmptyDocument(),
      recovered: true,
      reason: "invalid_document",
    };
  }
}
