import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarChrome, SidebarLayout } from "./sidebar-chrome";
afterEach(() => vi.useRealTimers());
function dom() {
  const window = new JSDOM('<div id="tools"><button>工具</button><input></div><aside></aside>', { pretendToBeVisual: true }).window;
  const tools = window.document.querySelector<HTMLElement>("#tools")!;
  return { window, tools, event: (name: string) => tools.dispatchEvent(new window.Event(name)) };
}
describe("标题行显隐", () => {
  it("默认隐藏，移入立即显示，离开4999ms仍显示，5000ms隐藏", () => {
    vi.useFakeTimers(); const { tools, event } = dom(); const chrome = new SidebarChrome(tools);
    expect(tools.dataset.toolsVisible).toBe("false"); event("pointerenter"); expect(tools.dataset.toolsVisible).toBe("true");
    event("pointerleave"); vi.advanceTimersByTime(4999); expect(tools.dataset.toolsVisible).toBe("true");
    vi.advanceTimersByTime(1); expect(tools.dataset.toolsVisible).toBe("false"); chrome.destroy();
  });
  it("重新进入取消旧timer，离开重新计满5秒", () => {
    vi.useFakeTimers(); const { tools, event } = dom(); const chrome = new SidebarChrome(tools);
    event("pointerenter"); event("pointerleave"); vi.advanceTimersByTime(4000); event("pointerenter"); vi.advanceTimersByTime(6000);
    expect(tools.dataset.toolsVisible).toBe("true"); event("pointerleave"); vi.advanceTimersByTime(4999); expect(tools.dataset.toolsVisible).toBe("true");
    vi.advanceTimersByTime(1); expect(tools.dataset.toolsVisible).toBe("false"); chrome.destroy();
  });
  it("菜单、focus和composition各自保活，结束重新计时", async () => {
    vi.useFakeTimers(); const { tools, event } = dom(); const chrome = new SidebarChrome(tools);
    chrome.setMenuOpen(true); event("pointerleave"); vi.advanceTimersByTime(6000); expect(tools.dataset.toolsVisible).toBe("true");
    const input = tools.querySelector("input")!; input.focus(); chrome.setMenuOpen(false); vi.advanceTimersByTime(6000); expect(tools.dataset.toolsVisible).toBe("true");
    event("compositionstart"); input.blur(); await Promise.resolve(); vi.advanceTimersByTime(6000); expect(tools.dataset.toolsVisible).toBe("true");
    event("compositionend"); vi.advanceTimersByTime(4999); expect(tools.dataset.toolsVisible).toBe("true"); vi.advanceTimersByTime(1); expect(tools.dataset.toolsVisible).toBe("false"); chrome.destroy();
  });
  it("destroy及重载不会遗留timer或旧事件", () => {
    vi.useFakeTimers(); const { tools, event } = dom(); const chrome = new SidebarChrome(tools);
    event("pointerenter"); event("pointerleave"); chrome.destroy();
    const next = new SidebarChrome(tools); event("pointerenter"); vi.advanceTimersByTime(6000); expect(tools.dataset.toolsVisible).toBe("true");
    next.destroy(); event("pointerleave"); expect(vi.getTimerCount()).toBe(0);
  });
});
describe("侧栏两阶段布局", () => {
  it("先保留空间再显示内容，快速反向后落在最后布局", () => {
    vi.useFakeTimers(); const { window } = dom(); const root = window.document.querySelector("aside")!; const layout = new SidebarLayout(root);
    layout.setCollapsed(false); expect(root.classList.contains("analysis-panel-collapsed")).toBe(false); expect(root.dataset.sidebarPhase).toBe("reserving");
    vi.advanceTimersByTime(219); expect(root.dataset.sidebarPhase).toBe("reserving"); vi.advanceTimersByTime(1); expect(root.dataset.sidebarPhase).toBe("open");
    layout.setCollapsed(true); vi.advanceTimersByTime(50); layout.setCollapsed(false); vi.advanceTimersByTime(50); layout.setCollapsed(true);
    vi.advanceTimersByTime(1000); expect(root.dataset.sidebarPhase).toBe("closed"); expect(root.classList.contains("analysis-panel-collapsed")).toBe(true);
    layout.setCollapsed(false); layout.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it("reduced motion立即完成最终布局", () => {
    vi.useFakeTimers(); const { window } = dom(); Object.defineProperty(window, "matchMedia", { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    const baseline = vi.getTimerCount(); const root = window.document.querySelector("aside")!; const layout = new SidebarLayout(root);
    layout.setCollapsed(false); expect(root.dataset.sidebarPhase).toBe("open"); layout.setCollapsed(true); expect(root.dataset.sidebarPhase).toBe("closed"); expect(vi.getTimerCount()).toBe(baseline); layout.destroy();
  });
});

describe("生产CSS宽度计算接缝", () => {
  // CSSOM reads the shipped cascade. This is a calculation proof; C's hidden WK
  // runner separately verifies actual rendered edges and animation boundaries.
  it("宽窗/640/600/480/320的侧栏边界与正文让位使用同一计算依据", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const window = new JSDOM('<style></style><main id="app"><aside class="analysis-panel"></aside><div class="editor-workspace"></div></main>').window;
    window.document.querySelector("style")!.textContent = css;
    const sheet = window.document.styleSheets[0];
    function declarations(selector: string, viewport: number): Map<string, string> {
      const values = new Map<string, string>();
      function walk(rules: CSSRuleList): void {
        for (const rule of Array.from(rules)) {
          if ("conditionText" in rule && "cssRules" in rule) {
            const query = String(rule.conditionText).match(/^\(max-width: (\d+)px\)$/);
            if (query && viewport <= Number(query[1])) walk(rule.cssRules as CSSRuleList);
          } else if ("selectorText" in rule && rule.selectorText === selector && "style" in rule) {
            const style = rule.style as CSSStyleDeclaration;
            for (const name of Array.from(style)) values.set(name, style.getPropertyValue(name));
          }
        }
      }
      walk(sheet.cssRules as unknown as CSSRuleList); return values;
    }
    function length(value: string, viewport: number): number {
      const minimum = value.match(/^min\((.+)\)$/);
      if (minimum) return Math.min(...minimum[1].split(",").map(term => length(term.trim(), viewport)));
      const dimension = value.match(/^(\d+(?:\.\d+)?)(px|vw)$/);
      if (!dimension) throw new Error(`Unsupported production length: ${value}`);
      return Number(dimension[1]) * (dimension[2] === "vw" ? viewport / 100 : 1);
    }
    for (const [viewport, expected] of [[1280, 240], [640, 240], [600, 240], [480, 216], [320, 144]]) {
      const source = declarations("#app", viewport).get("--sidebar-width")!;
      const panel = declarations(".analysis-panel", viewport);
      expect(panel.get("box-sizing")).toBe("border-box");
      const basis = viewport <= 640 ? panel.get("width")! : panel.get("flex-basis")!;
      expect(basis).toBe("var(--sidebar-width)");
      expect(panel.get("max-width")).toBeUndefined();
      if (viewport <= 640) {
        const workspace = declarations("#app:has(.analysis-panel:not(.analysis-panel-collapsed)) .editor-workspace", viewport);
        expect(workspace.get("margin-left")).toBe(basis);
        expect(declarations(".analysis-panel.analysis-panel-collapsed", viewport).get("width")).toBe("0px");
      }
      expect(length(source, viewport)).toBe(expected);
    }
    window.close();
  });
});
