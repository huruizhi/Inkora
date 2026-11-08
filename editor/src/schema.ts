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
  | "doc"
  | "paragraph"
  | "heading"
  | "text"
  | "hard_break"
  | "horizontal_rule"
  | "blockquote"
  | "code_block"
  | "ordered_list"
  | "bullet_list"
  | "list_item";

export type InkoraMarkName = "strong" | "em" | "strike" | "code" | "link";

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
  ordered_list: {
    ...baseOrderedList,
    attrs: {
      order: { default: 1, validate: validateListOrder },
      delimiter: { default: ".", validate: validateOrderedDelimiter },
      tight: { default: false, validate: "boolean" },
    },
    content: "list_item+",
    group: "block",
  },
  bullet_list: {
    ...baseBulletList,
    attrs: {
      bullet: { default: "-", validate: validateBullet },
      tight: { default: false, validate: "boolean" },
    },
    content: "list_item+",
    group: "block",
  },
  list_item: {
    ...baseListItem,
    content: "paragraph block*",
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
