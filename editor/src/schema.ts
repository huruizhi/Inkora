import {
  type DOMOutputSpec,
  type Node as ProseMirrorNode,
  type NodeSpec,
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

export const inkoraSchema = new Schema<InkoraNodeName>({
  nodes: inkoraNodeSpecs,
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
