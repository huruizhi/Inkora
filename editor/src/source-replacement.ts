import { textareaProjection } from "./source-navigation";
import type { DirectedSelection, SourceReplacementPlan } from "./source-search";

export type SourceReplacementValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isWellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validSelection(raw: string, selection: DirectedSelection): boolean {
  const boundaries = new Set<number>([0, raw.length]);
  for (const segment of segmenter.segment(raw)) boundaries.add(segment.index);
  return [selection.anchor, selection.head].every((position) =>
    Number.isInteger(position) && position >= 0 && position <= raw.length &&
    boundaries.has(position) && !(position > 0 && position < raw.length &&
      raw[position - 1] === "\r" && raw[position] === "\n"));
}

function rejected(message: string): SourceReplacementValidation {
  return { ok: false, message };
}

/** Runtime-side validation for an untrusted replacement plan. No mutation occurs here. */
export function validateSourceReplacementPlan(
  plan: SourceReplacementPlan,
  currentRaw: string,
  textareaValue: string,
): SourceReplacementValidation {
  if (plan.source.raw !== currentRaw) return rejected("替换计划的原文已过期");
  if (textareaValue !== textareaProjection(currentRaw)) {
    return rejected("原文与源码编辑器投影不一致");
  }
  if (plan.applyOrder !== "descending") return rejected("替换计划顺序无效");
  if (plan.changed !== (plan.patches.length > 0) ||
      plan.replacedCount !== plan.patches.length) {
    return rejected("替换计划计数无效");
  }
  if (!isWellFormed(plan.resultRaw) || !validSelection(plan.resultRaw, plan.selection)) {
    return rejected("替换结果或选区包含无效 Unicode 边界");
  }

  let previousFrom = currentRaw.length + 1;
  let result = currentRaw;
  for (const patch of plan.patches) {
    if (!Number.isInteger(patch.from) || !Number.isInteger(patch.to) ||
        patch.from < 0 || patch.to < patch.from || patch.to > currentRaw.length ||
        patch.to > previousFrom) {
      return rejected("替换范围未按降序排列或发生重叠");
    }
    if (!isWellFormed(patch.expected) || !isWellFormed(patch.insert) ||
        currentRaw.slice(patch.from, patch.to) !== patch.expected ||
        !validSelection(currentRaw, { anchor: patch.from, head: patch.to })) {
      return rejected("替换范围、expected 或 Unicode 边界无效");
    }
    result = result.slice(0, patch.from) + patch.insert + result.slice(patch.to);
    previousFrom = patch.from;
  }
  if (result !== plan.resultRaw) return rejected("替换结果与补丁重推导不一致");
  if (!plan.changed && plan.resultRaw !== currentRaw) return rejected("无更改计划改变了原文");
  return { ok: true };
}
