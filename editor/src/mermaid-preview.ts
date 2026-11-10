// The local classic bundle exposes only these two consumed public operations.
// Avoid importing the package's unrelated diagram/layout extension types.
interface Mermaid {
  initialize(config: Readonly<Record<string, unknown>>): void;
  render(id: string, source: string, container: Element): Promise<{ svg: string }>;
}
type MermaidWindow = Window & { mermaid?: Mermaid };
const loaders = new WeakMap<Document, Promise<Mermaid>>();
const queues = new WeakMap<Document, Promise<void>>();
let serial = 0;

function loadRenderer(doc: Document): Promise<Mermaid> {
  let result = loaders.get(doc);
  if (result) return result;
  result = new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = "./vendor/mermaid-11.17.2.min.js";
    const timer = doc.defaultView!.setTimeout(() => reject(Error("图表组件加载超时")), 8000);
    script.onerror = () => {
      doc.defaultView!.clearTimeout(timer);
      reject(Error("图表组件暂不可用"));
    };
    script.onload = () => {
      doc.defaultView!.clearTimeout(timer);
      const renderer = (doc.defaultView as MermaidWindow).mermaid;
      if (!renderer || typeof renderer.render !== "function" || typeof renderer.initialize !== "function") {
        reject(Error("图表组件暂不可用")); return;
      }
      renderer.initialize({
        startOnLoad: false, securityLevel: "strict", theme: "neutral", htmlLabels: false,
        fontFamily: "Arial, sans-serif", maxTextSize: 20000, maxEdges: 200,
        suppressErrorRendering: true, flowchart: { htmlLabels: false },
        secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges",
          "htmlLabels", "flowchart", "theme", "themeCSS", "themeVariables", "fontFamily",
          "suppressErrorRendering", "dompurifyConfig"],
      });
      resolve(renderer);
    };
    doc.head.append(script);
  });
  loaders.set(doc, result);
  return result;
}

function safeSvg(svg: string, doc: Document): SVGElement {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror") ||
      root.querySelectorAll("*").length > 10000) throw Error("图表输出无效或过大");
  root.querySelectorAll("script, foreignObject, image, iframe, object, embed, a").forEach(node => node.remove());
  const externalUrl = (value: string): boolean => /@import/i.test(value) ||
    Array.from(value.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi))
      .some(match => !(match[1] ?? match[2] ?? match[3]).trim().startsWith("#"));
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) ||
          (/(?:^|:)href$/i.test(attribute.name) && !attribute.value.startsWith("#")) ||
          externalUrl(attribute.value)) element.removeAttribute(attribute.name);
    }
    if (element.localName === "style" && externalUrl(element.textContent ?? "")) element.remove();
  }
  return doc.importNode(root, true) as unknown as SVGElement;
}

/** Lazy local preview. Canceling a node prevents late work from replacing it. */
export function mountMermaidPreview(target: HTMLElement, source: string): () => void {
  const doc = target.ownerDocument;
  let canceled = false;
  let started = false;
  let observer: IntersectionObserver | undefined;
  target.dataset.state = "idle";
  const status = doc.createElement("p");
  status.className = "technical-preview-status";
  status.textContent = "图表预览";
  const preview = doc.createElement("button");
  preview.type = "button";
  preview.textContent = "显示图表";
  const start = (): void => {
    if (started || canceled) return;
    started = true;
    observer?.disconnect();
    const previous = queues.get(doc) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      if (canceled || !target.isConnected) return;
      target.dataset.state = "loading";
      status.textContent = "正在绘制图表…";
      preview.remove();
      try {
        if (source.length > 20000 || source.split(/[;\n]/).length > 300 ||
            /%%\s*\{|^\s*---\s*$|\bimg\s*:/m.test(source)) {
          throw Error("图表配置、外部图片或长度超出预览范围");
        }
        const renderer = await loadRenderer(doc);
        if (canceled || !target.isConnected) return;
        const stage = doc.createElement("div");
        target.append(stage);
        const { svg } = await renderer.render(`inkoraDiagram${++serial}`, source, stage);
        if (canceled || !target.isConnected) return;
        target.replaceChildren(safeSvg(svg, doc));
        target.dataset.state = "ready";
      } catch (error) {
        if (canceled || !target.isConnected) return;
        target.dataset.state = "error";
        target.dataset.failure = String(error instanceof Error ? error.message : error).slice(0, 200);
        status.textContent = "图表暂无法预览，请检查代码。原文已保留。";
        target.replaceChildren(status);
      }
    });
    queues.set(doc, work);
  };
  preview.addEventListener("click", event => { event.stopPropagation(); start(); });
  target.replaceChildren(status, preview);
  const Observer = doc.defaultView?.IntersectionObserver;
  if (Observer) {
    observer = new Observer(entries => { if (entries.some(entry => entry.isIntersecting)) start(); });
    observer.observe(target);
  }
  return () => { canceled = true; observer?.disconnect(); };
}
