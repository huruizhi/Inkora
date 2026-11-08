// PROTOTYPE UI: thin DOM adapter over SourceAuthorityController.
import { EditorView } from 'prosemirror-view';
import { SourceAuthorityController, type Affinity, type RawSelection } from './core';

declare global {
  interface Window {
    sourceAuthorityPrototype: ReturnType<typeof createPrototype>;
    fidelityPrototype: unknown;
  }
}

const initialRaw = 'a\n';
let controller = new SourceAuthorityController(initialRaw, { anchor: 1, head: 1, affinity: 'right' });
let sourceMode = false;
let view: EditorView;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw Error(`missing #${id}`);
  return element as T;
};

const source = byId<HTMLTextAreaElement>('source');

function command(name: string, action: () => boolean): boolean {
  const beforeState = controller.state;
  const accepted = action();
  if (accepted && controller.state !== beforeState) view.updateState(controller.state);
  render();
  return accepted;
}

function dispatchTransaction(transaction: Parameters<EditorView['dispatch']>[0]): void {
  command('dispatch', () => controller.dispatch(transaction));
}

function render(): void {
  const report = controller.stateReport();
  byId('state').textContent = JSON.stringify(report, null, 2);
  byId('current-raw').textContent = JSON.stringify(controller.currentRaw);
  byId('saved-raw').textContent = JSON.stringify(controller.savedRaw);
  byId('projection').textContent = JSON.stringify(controller.projection, null, 2);
  byId('selection').textContent = JSON.stringify({ raw: controller.rawSelection, visual: controller.state.selection.toJSON() }, null, 2);
  byId('history').textContent = `epoch=${controller.epoch} version=${controller.version} undo=${controller.past.length} redo=${controller.future.length}`;
  byId('eligibility').textContent = `save=${controller.saveEligible} source=${controller.sourceAccessible} documentDirty=${controller.documentDirty} draftDirty=${controller.draftDirty}`;
  source.readOnly = !sourceMode;
  if (!sourceMode) {
    source.value = controller.currentRaw;
    source.selectionStart = controller.rawSelection.head;
    source.selectionEnd = controller.rawSelection.anchor;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
    const guarded = controller.composing && ['save', 'source', 'apply', 'cancel', 'undo', 'redo', 'reset'].includes(button.dataset.command ?? '');
    button.disabled = guarded;
  }
}

function beginSource(): boolean {
  const accepted = controller.beginSource();
  if (!accepted) return false;
  sourceMode = true;
  source.readOnly = false;
  source.value = controller.draft!.raw;
  const selection = controller.draft!.selection;
  source.setSelectionRange(Math.min(selection.anchor, selection.head), Math.max(selection.anchor, selection.head), selection.anchor > selection.head ? 'backward' : 'forward');
  return true;
}

function updateDraftFromTextarea(): void {
  if (!sourceMode || !controller.draft) return;
  const anchor = source.selectionDirection === 'backward' ? source.selectionEnd : source.selectionStart;
  const head = source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd;
  controller.updateDraft(source.value, { anchor, head, affinity: 'right' });
  render();
}

function applySource(): boolean {
  updateDraftFromTextarea();
  const accepted = controller.applySource();
  if (accepted) sourceMode = false;
  return accepted;
}

function cancelSource(): boolean {
  const accepted = controller.cancelSource();
  if (accepted) sourceMode = false;
  return accepted;
}

function setRawSelection(offset: number, affinity: Affinity = 'right'): boolean {
  return command('selection', () => controller.setRawSelection(offset, offset, affinity));
}

function nativeType(text: string, compositionId?: unknown): boolean {
  return command('type', () => controller.nativeType(text, compositionId));
}

function reopen(raw: string, selection?: RawSelection): boolean {
  const accepted = controller.reopen(raw, selection);
  view.updateState(controller.state);
  render();
  return accepted;
}

view = new EditorView(byId('visual'), {
  state: controller.state,
  dispatchTransaction,
  handleKeyDown(_view, event) {
    if (event.key === 'Backspace') { event.preventDefault(); command('Backspace', () => controller.nativeBackspace()); return true; }
    if (event.key === 'Enter') { event.preventDefault(); command('Enter', () => controller.nativeEnter()); return true; }
    return false;
  },
});

view.dom.addEventListener('compositionstart', () => { controller.startComposition(); render(); });
view.dom.addEventListener('compositionend', () => { controller.endComposition(); render(); });
source.addEventListener('compositionstart', () => { controller.startComposition(); render(); });
source.addEventListener('compositionend', () => { controller.endComposition(); render(); });
source.addEventListener('input', updateDraftFromTextarea);
source.addEventListener('select', () => { if (sourceMode) updateDraftFromTextarea(); });

const actions: Record<string, () => boolean> = {
  reset: () => reopen(initialRaw, { anchor: 1, head: 1, affinity: 'right' }),
  typeSpace: () => nativeType(' '),
  typeB: () => nativeType('b'),
  enter: () => command('Enter', () => controller.nativeEnter()),
  save: () => command('save', () => controller.saveMemory()),
  source: () => command('source', beginSource),
  apply: () => command('apply', applySource),
  cancel: () => command('cancel', cancelSource),
  undo: () => command('undo', () => controller.undo()),
  redo: () => command('redo', () => controller.redo()),
  reopen: () => reopen(controller.savedRaw, controller.rawSelection),
};

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
  button.addEventListener('click', () => actions[button.dataset.command ?? '']?.());
}

function createPrototype() {
  return {
    get controller() { return controller; },
    get view() { return view; },
    get sourceMode() { return sourceMode; },
    actions,
    run(id: string) { return actions[id]?.() ?? false; },
    nativeType,
    setRawSelection,
    reopen,
    render,
  };
}

window.sourceAuthorityPrototype = createPrototype();
// Read-only compatibility shape for the existing native-host observer. It is
// an adapter over this controller, never an instance of the old FidelityModel.
window.fidelityPrototype = {
  get model() {
    return {
      get source() { return controller.currentRaw; },
      get saved() { return controller.savedRaw; },
      get state() { return controller.state; },
      get revision() { return controller.version; },
      get past() { return controller.past; },
      get future() { return controller.future; },
      get pending() { return controller.issues.length > 0; },
      get blocked() { return controller.diagnostic; },
      get dirty() { return controller.documentDirty; },
      get staged() { return null; },
    };
  },
  get sourceMode() { return sourceMode; },
  get composing() { return controller.composing; },
  get sourceComposing() { return sourceMode && controller.composing; },
  get view() { return view; },
};

render();
