import {
  MatchDecorator,
  ViewPlugin,
  DecorationSet,
  Decoration,
  EditorView,
  ViewUpdate,
} from "@codemirror/view";
import { Extension } from "@codemirror/state";
import type { MarkdownPostProcessorContext } from "obsidian";

// Match ==FLAG: message== where FLAG is word-like (letters, numbers, - or _)
const FLAG_REGEX = /==([A-Za-z][A-Za-z0-9_-]{1,24}):[^=]+==/g;

const flagDecorator = new MatchDecorator({
  regexp: FLAG_REGEX,
  decorate: (add, from, to, match) => {
    const type = (match[1] ?? "").toLowerCase();
    const classes = ["long-view-inline-flag", `long-view-inline-flag-${type}`];
    if (type === "missing") {
      classes.push("is-missing-flag");
    }
    add(
      from,
      to,
      Decoration.mark({
        class: classes.join(" "),
        attributes: { "data-flag-type": type },
      }),
    );
  },
});

class FlagHighlightView {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = flagDecorator.createDeco(view);
  }

  update(update: ViewUpdate) {
    this.decorations = flagDecorator.updateDeco(update, this.decorations);
  }
}

export function createFlagHighlightExtension(): Extension {
  const plugin = ViewPlugin.fromClass(FlagHighlightView, {
    decorations: (instance) => instance.decorations,
  });

  return plugin;
}

export function processRenderedFlags(
  element: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
): void {
  const marks = element.querySelectorAll("mark");
  marks.forEach((mark) => {
    if ((mark as HTMLElement).dataset.longViewFlag === "true") {
      return;
    }

    const text = mark.textContent ?? "";
    const match = text.match(/^(\w+):/);
    if (!match) {
      return;
    }

    const typeUpper = match[1].toUpperCase();

    const typeLower = typeUpper.toLowerCase();
    mark.classList.add(
      "long-view-inline-flag",
      `long-view-inline-flag-${typeLower}`,
    );
    if (typeUpper === "MISSING") {
      mark.classList.add("is-missing-flag");
    }
    (mark as HTMLElement).dataset.longViewFlag = "true";
    (mark as HTMLElement).dataset.flagType = typeLower;
  });
}
