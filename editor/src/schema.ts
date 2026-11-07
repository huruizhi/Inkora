import {
  type DOMOutputSpec,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type MarkSpec,
  Schema,
  type TagParseRule,
} from "prosemirror-model";

export type InkoraNodeName =
  | "doc"
  | "paragraph"
  | "heading"
  | "text"
  | "hard_break"
  | "horizontal_rule";

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

const headingParseRules: TagParseRule[] = headingLevels.map((level) => ({
  tag: `h${level}`,
  attrs: { level },
}));

export const inkoraNodeSpecs: Record<InkoraNodeName, NodeSpec> = {
  doc: {
    content: "block+",
  },
  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM: (): DOMOutputSpec => ["p", 0],
  },
  heading: {
    attrs: {
      level: {
        default: 1,
        validate: validateHeadingLevel,
      },
    },
    content: "inline*",
    defining: true,
    group: "block",
    parseDOM: headingParseRules,
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
