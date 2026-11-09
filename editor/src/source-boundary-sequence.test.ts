import { describe, expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

describe("raw selection boundary sequences", () => {
  it("keeps manually specified Unicode graphemes indivisible at every UTF-16 position", () => {
    const chunks = ["a", "🇨🇳", "e\u0301", "👩‍💻", "각", "कि", "z"];
    const raw = chunks.join("");
    const valid = new Set([0, raw.length]);
    let next = 0;
    for (const chunk of chunks) { next += chunk.length; valid.add(next); }
    const session = new SourceAuthoritySession(raw);
    for (let offset = 0; offset <= raw.length; offset++) {
      const before = { ...session.rawSelection };
      expect(session.setRawSelection(offset), `raw position ${offset}`).toBe(valid.has(offset));
      if (!valid.has(offset)) expect(session.rawSelection).toEqual(before);
      expect(session.currentRaw).toBe(raw);
      expect(session.version).toBe(0);
      expect(session.past).toHaveLength(0);
    }
  });

  it("reproves boundaries after source commits, history and BOM/CRLF changes", () => {
    const session = new SourceAuthoritySession("AeZ\r\n");
    expect(session.setRawSelection(2)).toBe(true);
    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft("Ae\u0301Z\r\n", { anchor: 3, head: 3, affinity: "right" })).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.currentRaw).toBe("Ae\u0301Z\r\n");
    expect(session.setRawSelection(2)).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.setRawSelection(2)).toBe(true);
    expect(session.redo()).toBe(true);
    expect(session.setRawSelection(2)).toBe(false);
    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft("\uFEFFA🇨🇳e\u0301Z\r\n", { anchor: 8, head: 8, affinity: "right" })).toBe(true);
    expect(session.applySource()).toBe(true);
    for (const offset of [0, 3, 4, 5, 7, 10]) {
      expect(session.setRawSelection(offset), `invalid raw position ${offset}`).toBe(false);
    }
    expect(session.setRawSelection(8)).toBe(true);
    expect(session.saveMemory()).toBe(true);
    expect(session.savedRaw).toBe("\uFEFFA🇨🇳e\u0301Z\r\n");
    expect(session.beginSource()).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.rawSelection.head).toBe(8);
  });
});
