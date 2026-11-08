// INK-PROT-023: read-only runtime observation. Never synthesizes DOM/input events.
(() => {
  "use strict";
  const version = "ink-prot-031-observer-v3";
  let sequence = 0;

  const targetName = (target) => {
    if (!(target instanceof Element)) return "unknown";
    if (target.id === "source-draft" || (target.id === "source" && target.tagName === "TEXTAREA")) return "source-draft";
    if (target.closest(".ProseMirror")) return "prosemirror";
    return target.id || target.tagName.toLowerCase();
  };

  const post = (event) => {
    const handler = globalThis.webkit?.messageHandlers?.runtimeObserver;
    if (handler) handler.postMessage(event);
  };

  for (const type of [
    "compositionstart", "compositionupdate", "compositionend",
    "beforeinput", "input", "selectionchange", "focusin", "focusout"
  ]) {
    document.addEventListener(type, (event) => {
      const target = event.target;
      const name = targetName(target);
      if (name !== "prosemirror" && name !== "source-draft") return;
      post({
        version,
        sequence: ++sequence,
        type,
        target: name,
        data: typeof event.data === "string" ? event.data : null,
        inputType: typeof event.inputType === "string" ? event.inputType : null,
        isComposing: typeof event.isComposing === "boolean" ? event.isComposing : null,
      });
    }, true);
  }

  globalThis.__inkoraRuntimeObserver = Object.freeze({
    version,
    snapshot() {
      const prototype = globalThis.fidelityPrototype;
      const model = prototype?.model;
      const view = prototype?.view;
      const textarea = document.getElementById("source-draft")
        ?? document.querySelector("textarea#source");
      const authority = globalThis.sourceAuthorityPrototype?.controller;
      const selection = model?.state?.selection;
      const modelDirty = model?.dirty;
      const staged = model?.staged;
      const sourceComposing = prototype?.sourceComposing;
      const prototypeComposing = prototype?.composing;
      return {
        version,
        sourceMode: Boolean(prototype?.sourceMode),
        revision: model?.revision ?? null,
        pending: Boolean(model?.pending),
        blocked: model?.blocked || null,
        dirty: model ? (
          typeof modelDirty === "boolean"
            ? modelDirty
            : model.source !== model.saved || Boolean(staged)
        ) : null,
        staged: model ? Boolean(staged) : null,
        stagedKind: typeof staged?.kind === "string" ? staged.kind : null,
        past: model?.past?.length ?? null,
        future: model?.future?.length ?? null,
        selection: selection ? {
          from: selection.from,
          to: selection.to,
          anchor: selection.anchor,
          head: selection.head,
        } : null,
        sourceComposing: typeof sourceComposing === "boolean" ? sourceComposing : null,
        composing: typeof prototypeComposing === "boolean"
          ? prototypeComposing
          : Boolean(view?.composing),
        textarea: textarea ? {
          readOnly: textarea.readOnly,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          selectionDirection: textarea.selectionDirection,
        } : null,
        activeElement: targetName(document.activeElement),
        saveDisabled: Boolean((document.getElementById("save")
          ?? document.querySelector('button[data-command="save"]'))?.disabled),
        sourceAuthority: authority ? {
          currentRaw: authority.currentRaw,
          savedRaw: authority.savedRaw,
          rawSelection: { ...authority.rawSelection },
          saveEligible: authority.saveEligible,
          sourceAccessible: authority.sourceAccessible,
          draftDirty: authority.draftDirty,
          draftRaw: authority.draft?.raw ?? null,
          epoch: authority.epoch,
          unresolvedIntent: authority.unresolvedIntent?.description ?? null,
        } : null,
      };
    },
  });
})();
