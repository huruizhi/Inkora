import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { CODE_LANGUAGES, buildLanguageAttr, firstInfoToken, resolveHighlightLanguageId } from './code-highlighting';
import type { CodeLanguageChangeResult } from './code-block-view';

let nextPicker = 0;
const pickerLanguages = [...CODE_LANGUAGES, { id: 'mermaid', label: 'Mermaid 图表（mermaid）', aliases: [] as string[] }];
type Context = { toolbar: HTMLElement; view: EditorView; node: () => PMNode; getPos: () => number | undefined;
  isComposing: () => boolean; apply: (getPos: () => number | undefined, node: PMNode, language: string | null) => CodeLanguageChangeResult;
  message: (text: string) => void; onCompositionChange?: (active: boolean) => void; onFocusChange?: (focused: boolean) => void };

export function mountCodeLanguagePicker(context: Context) {
  const { toolbar, view } = context;
  const doc = toolbar.ownerDocument; const win = doc.defaultView!;
  const input = doc.createElement('input'); input.type = 'search'; input.className = 'code-language-query';
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-label', '搜索代码语言');
  input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
  const list = doc.createElement('div'); list.className = 'code-language-choices'; list.id = `code-languages-${++nextPicker}`;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '代码语言候选'); list.contentEditable = 'false'; list.hidden = true;
  input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'false');
  list.setAttribute('popover', 'manual'); doc.body.append(list); toolbar.append(input);
  let alive = true; let composing = false; let compositionActive = false; let endedAt = -Infinity;
  let settlingTimer: number | undefined;
  let binding: { state: typeof view.state; node: PMNode; pos: number } | undefined;
  let choices: Array<{ id: string; label: string }> = []; let active = 0;
  const valid = () => alive && input.isConnected && !view.isDestroyed && view.editable &&
    !context.isComposing() && !view.composing && !composing && !input.disabled;
  const close = () => {
    binding = undefined; list.hidden = true;
    if (typeof list.hidePopover === 'function' && list.matches(':popover-open')) list.hidePopover?.();
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    toolbar.classList.remove('has-language-picker');
    doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('scroll', scrolled, true);
    win.removeEventListener('resize', resized);
  };
  const selected = () => {
    [...list.querySelectorAll<HTMLElement>('[role=option]')].forEach((item, index) => item.setAttribute('aria-selected', String(index === active)));
    const item = list.children[active] as HTMLElement | undefined;
    if (!item) { input.removeAttribute('aria-activedescendant'); return; }
    input.setAttribute('aria-activedescendant', item.id);
    const bounds = list.getBoundingClientRect(); const target = item.getBoundingClientRect();
    if (target.top < bounds.top) list.scrollTop -= bounds.top - target.top;
    else if (target.bottom > bounds.bottom) list.scrollTop += target.bottom - bounds.bottom;
  };
  const choose = (id: string, expected = binding) => {
    if (composing || context.isComposing() || view.composing) return;
    if (!binding || expected !== binding || list.hidden) return;
    if (!valid() || binding.state !== view.state) { close(); return; }
    const target = binding;
    const next = buildLanguageAttr(target.node.attrs.language as string | null, id);
    close();
    if (next !== target.node.attrs.language) {
      const result = context.apply(() => target.pos, target.node, next);
      context.message(result.ok ? '' : result.message ?? '无法安全修改代码语言。');
    }
    if (!view.isDestroyed) view.focus();
  };
  const render = () => {
    if (!valid()) return;
    let pos: number | undefined;
    try { pos = context.getPos(); } catch { return; }
    if (pos === undefined) return;
    binding = { state: view.state, node: context.node(), pos };
    const query = input.value.trim().toLowerCase();
    const score = (language: typeof CODE_LANGUAGES[number]) =>
      language.id === query || language.aliases.some(alias => alias.toLowerCase() === query) ? 0 :
        language.id.startsWith(query) ? 1 : language.label.toLowerCase().startsWith(query) ? 2 : 3;
    choices = pickerLanguages.filter(language => language.id.startsWith(query) ||
      language.label.toLowerCase().startsWith(query) || language.aliases.some(alias => alias.toLowerCase().startsWith(query)) || resolveHighlightLanguageId(query) === language.id)
      .sort((left, right) => score(left) - score(right)).slice(0, 30);
    active = 0;
    list.replaceChildren();
    const lease = binding;
    for (const [index, language] of choices.entries()) {
      const item = doc.createElement('button'); item.type = 'button'; item.tabIndex = -1;
      item.id = `${list.id}-${index}`; item.setAttribute('role', 'option'); item.dataset.language = language.id;
      item.textContent = language.label;
      item.addEventListener('pointerdown', event => event.preventDefault());
      item.addEventListener('click', () => { if (item.isConnected) choose(language.id, lease); }); list.append(item);
    }
    list.hidden = false; toolbar.classList.add('has-language-picker');
    if (typeof list.showPopover === 'function' && !list.matches(':popover-open')) list.showPopover();
    const rect = input.getBoundingClientRect(); const width = Math.min(320, win.innerWidth - 16);
    const above = rect.top - 8; const below = win.innerHeight - rect.bottom - 8;
    const height = Math.max(40, Math.min(240, Math.max(above, below)));
    Object.assign(list.style, { width: `${width}px`, maxHeight: `${height}px`, left: `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`,
      top: `${below >= Math.min(120, above) ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(height, list.scrollHeight) - 4)}px` });
    input.setAttribute('aria-expanded', 'true'); selected();
    context.message(choices.length ? '' : '没有匹配语言；原文保持不变。');
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('scroll', scrolled, true); win.addEventListener('resize', resized);
  };
  const outside = (event: Event) => { if (!composing && !toolbar.contains(event.target as Node) && !list.contains(event.target as Node)) close(); };
  const scrolled = (event: Event) => { if (!composing && event.target !== list && !list.contains(event.target as Node)) close(); };
  const resized = () => { if (!composing) close(); };
  const settleQuery = () => {
    if (settlingTimer !== undefined) win.clearTimeout(settlingTimer);
    settlingTimer = win.setTimeout(() => {
      settlingTimer = undefined;
      if (!alive || compositionActive) return;
      composing = false; context.onCompositionChange?.(false);
      if (doc.activeElement === input) render(); else close();
    }, 100);
  };
  input.addEventListener('focus', () => { context.onFocusChange?.(true); render(); });
  input.addEventListener('input', () => { if (composing) { if (!compositionActive) settleQuery(); } else render(); });
  input.addEventListener('compositionstart', event => {
    if (settlingTimer !== undefined) win.clearTimeout(settlingTimer);
    composing = compositionActive = true; context.onCompositionChange?.(true); event.stopPropagation();
  });
  input.addEventListener('compositionend', event => {
    compositionActive = false; endedAt = Date.now(); event.stopPropagation(); settleQuery();
  });
  input.addEventListener('keydown', event => {
    if (['Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) event.stopPropagation();
    if (event.isComposing || composing || context.isComposing()) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); view.focus(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Enter') {
      if (Date.now() - endedAt < 100) return;
      event.preventDefault(); if (choices[active]) choose(choices[active].id); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); if (list.hidden) render();
    active = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 :
      (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % Math.max(1, choices.length);
    selected();
  });
  input.addEventListener('blur', () => { context.onFocusChange?.(false); if (!composing) close(); });
  return {
    update() {
      input.disabled = context.node().attrs.style === 'indented';
      input.placeholder = `搜索语言（${firstInfoToken(context.node().attrs.language) || '纯文本'}）`;
      if (!composing && binding && binding.state !== view.state) close();
    },
    destroy() { alive = false; context.onFocusChange?.(false); if (settlingTimer !== undefined) win.clearTimeout(settlingTimer);
      if (composing) { composing = false; context.onCompositionChange?.(false); } close(); list.remove(); },
  };
}
