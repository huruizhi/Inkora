// PROTOTYPE UI: thin DOM adapter over SourceAuthorityController.
import { EditorView } from 'prosemirror-view';
import { TextAreaEditorKernel } from '../../src/editor-kernel';
import { lfToRaw, rawToLf } from '../fidelity/selection-map';
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
let lastDispatchAccepted = false;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw Error(`missing #${id}`);
  return element as T;
};

const source = byId<HTMLTextAreaElement>('source');
const sourceKernel = new TextAreaEditorKernel(source);

function command(name: string, action: () => boolean): boolean {
  const beforeState = controller.state;
  const accepted = action();
  if (accepted && controller.state !== beforeState) view.updateState(controller.state);
  render();
  return accepted;
}

function dispatchTransaction(transaction: Parameters<EditorView['dispatch']>[0]): void {
  lastDispatchAccepted = command('dispatch', () => controller.dispatch(transaction));
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
    sourceKernel.setText(controller.currentRaw);
    const start = rawToLf(controller.currentRaw, Math.min(controller.rawSelection.anchor, controller.rawSelection.head));
    const end = rawToLf(controller.currentRaw, Math.max(controller.rawSelection.anchor, controller.rawSelection.head));
    source.setSelectionRange(start, end, controller.rawSelection.anchor > controller.rawSelection.head ? 'backward' : 'forward');
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
  sourceKernel.setText(controller.draft!.raw);
  const selection = controller.draft!.selection;
  source.setSelectionRange(
    rawToLf(controller.draft!.raw, Math.min(selection.anchor, selection.head)),
    rawToLf(controller.draft!.raw, Math.max(selection.anchor, selection.head)),
    selection.anchor > selection.head ? 'backward' : 'forward',
  );
  return true;
}

function updateDraftFromTextarea(): void {
  if (!sourceMode || !controller.draft) return;
  const raw = sourceKernel.getText();
  const anchorLf = source.selectionDirection === 'backward' ? source.selectionEnd : source.selectionStart;
  const headLf = source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd;
  controller.updateDraft(raw, {
    anchor: lfToRaw(raw, anchorLf),
    head: lfToRaw(raw, headLf),
    affinity: 'right',
  });
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
  let transaction = view.state.tr.insertText(text);
  if (compositionId !== undefined) transaction = transaction.setMeta('composition', compositionId);
  lastDispatchAccepted = false;
  view.dispatch(transaction);
  return lastDispatchAccepted;
}

function nativeReplace(from: number, to: number, text: string, compositionId?: unknown): boolean {
  let transaction = view.state.tr.insertText(text, from, to);
  if (compositionId !== undefined) transaction = transaction.setMeta('composition', compositionId);
  lastDispatchAccepted = false;
  view.dispatch(transaction);
  return lastDispatchAccepted;
}

function travel(direction: 'undo' | 'redo'): boolean {
  const accepted = direction === 'undo' ? controller.undo() : controller.redo();
  if (accepted && !controller.draft) sourceMode = false;
  return accepted;
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
sourceKernel.onChange(updateDraftFromTextarea);
source.addEventListener('compositionstart', () => { controller.startComposition(); render(); });
source.addEventListener('compositionend', () => { controller.endComposition(); render(); });
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
  undo: () => command('undo', () => travel('undo')),
  redo: () => command('redo', () => travel('redo')),
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
    nativeReplace,
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
