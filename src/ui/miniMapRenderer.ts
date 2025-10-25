import { App, Component, TFile } from "obsidian";
import {
  DocumentHeading,
  DocumentPage,
  DocumentFlag,
  getFirstWords,
  computeHeadingCalloutStacks,
} from "../utils/documentParser";
import { MinimapFontSettings } from "../settings";

export interface MiniMapOptions {
  app: App;
  containerEl: HTMLElement;
  sourcePath: string;
  onSectionClick?: (offset: number) => void;
  onHeadingClick?: (offset: number) => void;
  showParagraphs?: boolean;
  numberSections?: boolean;
  minimapFonts: MinimapFontSettings;
  minimapLineGap: number;
  includeComments: boolean;
  includeImages?: boolean;
  includeFlagTypes?: boolean;
  hiddenFlags?: Set<string>; // lowercased flag types to hide
  hiddenSectionFlags?: Set<string>; // lowercased section flag types to hide
}

interface RenderedSection {
  page: DocumentPage;
  containerEl: HTMLElement;
}

type ContentFragment =
  | { type: "text"; text: string; startOffset: number }
  | { type: "image"; alt: string; link: string; startOffset: number }
  | { type: "heading"; heading: DocumentHeading }
  | { type: "flag"; flag: DocumentFlag };

export class MiniMapRenderer extends Component {
  private readonly options: MiniMapOptions;
  private minimapRootEl: HTMLElement | null = null;
  private contentWrapperEl: HTMLElement | null = null;
  private sections: RenderedSection[] = [];
  private pages: DocumentPage[] = [];
  private headingNumberMap: Map<number, string> = new Map();
  private headingEntries: Array<{ offset: number; element: HTMLElement }> = [];
  private activeHeadingEl: HTMLElement | null = null;
  private currentHeadingLevel: number = 0;
  private currentCalloutStack: Array<{ type: string; color: string }> = [];
  // Map from heading offset to its callout stack
  private headingCalloutStacks: Map<
    number,
    Array<{ type: string; color: string }>
  > = new Map();
  private minimapFonts: MinimapFontSettings;
  private minimapLineGap: number;
  private includeComments: boolean;
  private includeImages: boolean;
  private includeFlagTypes: boolean;
  private hiddenFlags: Set<string>;
  private hiddenSectionFlags: Set<string>;

  constructor(options: MiniMapOptions) {
    super();
    this.options = options;
    this.minimapFonts = options.minimapFonts;
    this.minimapLineGap = options.minimapLineGap;
    this.includeComments = options.includeComments;
    this.includeImages = options.includeImages !== false;
    this.includeFlagTypes = options.includeFlagTypes === true;
    this.hiddenFlags = new Set(
      Array.from(options.hiddenFlags ?? new Set<string>()).map((s) =>
        String(s || "").toLowerCase(),
      ),
    );
    this.hiddenSectionFlags = new Set(
      Array.from(options.hiddenSectionFlags ?? new Set<string>()).map((s) =>
        String(s || "").toLowerCase(),
      ),
    );
  }

  async initialize(pages: DocumentPage[]): Promise<void> {
    this.pages = pages;
    this.cleanup();
    this.computeHeadingNumbers();
    this.computeHeadingCalloutStacks();
    this.currentHeadingLevel = 0;
    this.currentCalloutStack = [];

    this.minimapRootEl = this.options.containerEl.createDiv({
      cls: "long-view-minimap",
    });
    this.contentWrapperEl = this.minimapRootEl.createDiv({
      cls: "long-view-minimap-content",
    });

    for (const page of pages) {
      const sectionEl = this.createSectionContainer(page);
      this.contentWrapperEl.appendChild(sectionEl);
      this.renderSection(sectionEl, page);
    }

    this.applyBaseStyles();
  }

  getMinimapElement(): HTMLElement | null {
    return this.minimapRootEl;
  }

  private createSectionContainer(page: DocumentPage): HTMLElement {
    const sectionEl = document.createElement("div");
    sectionEl.dataset.start = String(page.startOffset);
    sectionEl.dataset.end = String(page.endOffset);
    sectionEl.addEventListener("pointerdown", (event) => {
      if ((event as PointerEvent).button !== 0) {
        return;
      }
      event.preventDefault();
      const rect = sectionEl.getBoundingClientRect();
      const relativeY = event.clientY - rect.top;
      const ratio =
        rect.height > 0 ? Math.min(1, Math.max(0, relativeY / rect.height)) : 0;
      const span = Math.max(1, page.endOffset - page.startOffset);
      const targetOffset = page.startOffset + Math.round(span * ratio);
      this.options.onSectionClick?.(targetOffset);
    });
    return sectionEl;
  }

  private renderSection(sectionEl: HTMLElement, page: DocumentPage): void {
    const contentEl = sectionEl.createDiv({
      cls: "long-view-minimap-section-content",
    });

    // Track current state for rendering
    let currentCalloutStack = this.currentCalloutStack.slice();
    let activeCalloutStack: Array<{ type: string; color: string }> = [];
    let currentLevel = this.currentHeadingLevel;
    let flowEl: HTMLElement | null = null;

    // Track currently open callout wrapper elements
    let openCalloutWrappers: HTMLElement[] = [];

    // Helper to update callout wrappers based on new stack
    const updateCalloutWrappers = (
      newStack: Array<{ type: string; color: string }>,
    ): HTMLElement => {
      const filteredStack = newStack.filter((callout) =>
        this.shouldRenderCalloutBackground(callout.type),
      );

      // Find common prefix length
      let commonPrefixLen = 0;
      while (
        commonPrefixLen <
          Math.min(activeCalloutStack.length, filteredStack.length) &&
        activeCalloutStack[commonPrefixLen].type ===
          filteredStack[commonPrefixLen].type &&
        activeCalloutStack[commonPrefixLen].color ===
          filteredStack[commonPrefixLen].color
      ) {
        commonPrefixLen++;
      }

      // Keep only the common prefix wrappers
      openCalloutWrappers = openCalloutWrappers.slice(0, commonPrefixLen);

      // Determine where to append new wrappers
      let container =
        openCalloutWrappers.length > 0
          ? openCalloutWrappers[openCalloutWrappers.length - 1]
          : contentEl;

      // Add new wrappers for the rest of the stack
      for (let i = commonPrefixLen; i < filteredStack.length; i++) {
        const callout = filteredStack[i];
        const calloutWrapper = container.createDiv({
          cls: "long-view-minimap-callout-bg",
        });
        this.applyCalloutBackgroundTint(
          calloutWrapper,
          callout.color,
          callout.type,
        );
        openCalloutWrappers.push(calloutWrapper);
        container = calloutWrapper;
      }

      // Update active callout stack to reflect wrappers we just built
      activeCalloutStack = filteredStack.map((callout) => ({
        type: callout.type,
        color: callout.color,
      }));

      currentCalloutStack = filteredStack.slice();

      return container;
    };

    // Helper to create section-specific structure (hierarchy bars + section body)
    const createSectionStructure = (
      container: HTMLElement,
      level: number,
    ): HTMLElement => {
      // Create nested divs for hierarchy bars
      for (let l = 2; l <= level; l++) {
        const hierarchyDiv = container.createDiv({
          cls: "long-view-minimap-hierarchy-level",
        });
        container = hierarchyDiv;
      }

      return container.createDiv({ cls: "long-view-minimap-section-body" });
    };

    try {
      const fragments = this.tokenizeContent(page);
      for (const fragment of fragments) {
        if (fragment.type === "heading") {
          const headingInfo = fragment.heading;

          // Get the callout stack for this heading and update wrappers to match
          const headingStack =
            this.headingCalloutStacks.get(headingInfo.startOffset) || [];
          const calloutContainer = updateCalloutWrappers(headingStack);

          // Always create a fresh section structure for each heading so sibling
          // sections don't re-use the prior flow container.
          currentLevel = headingInfo.level;
          flowEl = createSectionStructure(calloutContainer, currentLevel);

          // Update current heading level for next iteration
          this.currentHeadingLevel = headingInfo.level;

          const numbering = this.headingNumberMap.get(headingInfo.startOffset);
          const headingEl = flowEl.createDiv({
            cls: "long-view-minimap-heading",
          });

          // Show numbering only if numberSections is enabled
          const showNumbering = this.options.numberSections !== false;
          const headingText =
            showNumbering && numbering
              ? `${numbering} ${headingInfo.text}`
              : headingInfo.text;
          headingEl.setText(headingText);

          headingEl.dataset.offset = String(headingInfo.startOffset);
          headingEl.dataset.level = String(headingInfo.level);
          headingEl.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.options.onHeadingClick?.(headingInfo.startOffset);
          });
          this.headingEntries.push({
            offset: headingInfo.startOffset,
            element: headingEl,
          });

          // If this heading has a callout, display the callout title below it at 0.5 opacity
        if (
          headingInfo.callout &&
          !this.isSectionFlagHidden(headingInfo.callout.type)
        ) {
          const calloutTitleEl = flowEl.createDiv({
            cls: "long-view-minimap-callout-title",
          });
          // Optionally include the TYPE label for section flags, except SUMMARY
          const calloutType = String(headingInfo.callout.type || "").toUpperCase();
          const showType = this.includeFlagTypes && calloutType !== "SUMMARY";
          const titleText = headingInfo.callout.title || "";
          if (showType) {
            // Render TYPE label followed by title text
            const typeSpan = calloutTitleEl.createSpan({
              cls: "long-view-minimap-flag-type",
              text: calloutType,
            });
            calloutTitleEl.createSpan({ text: titleText ? " — " : "" });
            calloutTitleEl.createSpan({ text: titleText });
          } else {
            calloutTitleEl.setText(titleText);
          }
        }
        } else if (fragment.type === "text") {
          // Ensure we have a flowEl for content before any heading
          if (!flowEl) {
            const calloutContainer = updateCalloutWrappers(currentCalloutStack);
            flowEl = createSectionStructure(calloutContainer, currentLevel);
          }
          // Only render paragraphs if the setting is enabled
          const showParagraphs = this.options.showParagraphs !== false;
          if (showParagraphs) {
            const lines = this.tokenizeLines(fragment.text);
            for (const line of lines) {
              flowEl.createEl("p", {
                cls: "long-view-minimap-line",
                text: line,
              });
            }
          }
        } else if (fragment.type === "image") {
          if (!this.includeImages) {
            continue;
          }
          if (!flowEl) {
            const calloutContainer = updateCalloutWrappers(currentCalloutStack);
            flowEl = createSectionStructure(calloutContainer, currentLevel);
          }
          const src = this.resolveImageSrc(fragment.link);
          if (!src) {
            continue;
          }
          const imgEl = flowEl.createEl("img", {
            cls: "long-view-minimap-image",
          });
          imgEl.src = src;
          imgEl.alt = fragment.alt || fragment.link;
        } else if (fragment.type === "flag") {
          if (
            !this.includeComments &&
            fragment.flag.type.toUpperCase() === "COMMENT"
          ) {
            continue;
          }
          // Hide filtered flags
          const flagLower = (fragment.flag.type || "").toLowerCase();
          if (this.hiddenFlags.has(flagLower)) {
            continue;
          }
          if (!flowEl) {
            const calloutContainer = updateCalloutWrappers(currentCalloutStack);
            flowEl = createSectionStructure(calloutContainer, currentLevel);
          }
          const flagInfo = fragment.flag;
          const flagEl = flowEl.createDiv({ cls: "long-view-minimap-flag" });
          const flagTypeUpper = flagInfo.type.toUpperCase();
          const flagTypeLower = flagTypeUpper.toLowerCase();
          const isMissingFlag = flagTypeUpper === "MISSING";
          flagEl.addClass(`long-view-flag-type-${flagTypeLower}`);
          flagEl.dataset.flagType = flagTypeLower;
          if (isMissingFlag) {
            flagEl.addClass("is-missing-flag");
          }

          // Compose content: optional TYPE label (except COMMENT), then message
          let messageText: string;
          const baseMessage =
            flagInfo.message.split("|")[0]?.trim() ?? flagInfo.message;
          if (isMissingFlag) {
            messageText = baseMessage.length > 0 ? baseMessage : "Missing";
          } else {
            messageText = getFirstWords(baseMessage, 10);
          }
          const showTypeLabel = this.includeFlagTypes && flagTypeUpper !== "COMMENT";
          if (showTypeLabel) {
            flagEl.createSpan({
              cls: "long-view-minimap-flag-type",
              text: flagTypeUpper,
            });
            flagEl.createSpan({ text: ": " });
          }
          flagEl.createSpan({
            cls: "long-view-minimap-flag-message",
            text: messageText,
          });

          // Make flag clickable
          flagEl.addEventListener("pointerdown", (event: PointerEvent) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.options.onHeadingClick?.(flagInfo.startOffset);
          });
        }
      }

      this.sections.push({ page, containerEl: sectionEl });
    } catch (error) {
      console.error("MiniMapRenderer: Failed to render section", error);
      contentEl.setText(page.content);
    }

    // Persist state so the next section inherits current context
    this.currentCalloutStack = currentCalloutStack.slice();
    this.currentHeadingLevel = currentLevel;
  }

  private tokenizeContent(page: DocumentPage): ContentFragment[] {
    const fragments: ContentFragment[] = [];
    const headings = (page.headings ?? [])
      .slice()
      .sort((a, b) => a.startOffset - b.startOffset);
    const flags = (page.flags ?? [])
      .slice()
      .sort((a, b) => a.startOffset - b.startOffset);
    const content = page.content;
    const base = page.startOffset;

    // Create a merged sorted list of all special items (headings and flags)
    const specialItems: Array<{
      type: "heading" | "flag";
      offset: number;
      data: DocumentHeading | DocumentFlag;
    }> = [
      ...headings.map((h) => ({
        type: "heading" as const,
        offset: h.startOffset,
        data: h,
      })),
      ...flags.map((f) => ({
        type: "flag" as const,
        offset: f.startOffset,
        data: f,
      })),
    ].sort((a, b) => a.offset - b.offset);

    let cursor = 0;

    const pushText = (segment: string, segmentStart: number) => {
      fragments.push(...this.extractTextAndImages(segment, segmentStart));
    };

    for (const item of specialItems) {
      const relativeStart = Math.max(0, item.offset - base);
      if (relativeStart > cursor) {
        const beforeItem = content.substring(cursor, relativeStart);
        pushText(beforeItem, base + cursor);
      }

      if (item.type === "heading") {
        fragments.push({
          type: "heading",
          heading: item.data as DocumentHeading,
        });
        cursor = this.findHeadingLineEnd(content, relativeStart);
      } else if (item.type === "flag") {
        fragments.push({ type: "flag", flag: item.data as DocumentFlag });
        // Skip past the flag in the content
        // Try both patterns: ==TYPE: message == and %% comment %%
        const flagPattern = /==\w+:[^=]+==|%%[^%]+%%/;
        const match = content.substring(relativeStart).match(flagPattern);
        if (match) {
          cursor = relativeStart + match[0].length;
        } else {
          cursor = relativeStart;
        }
      }
    }

    if (cursor < content.length) {
      const tail = content.substring(cursor);
      pushText(tail, base + cursor);
    }

    return fragments;
  }

  private extractTextAndImages(
    content: string,
    segmentStart: number,
  ): ContentFragment[] {
    const fragments: ContentFragment[] = [];
    const imageRegex =
      /!\[([^\]]*)\]\(([^)]+)\)|!\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const pushTextLines = (text: string, startOffset: number) => {
      if (text.trim().length === 0) {
        return;
      }
      const lines = this.tokenizeLines(text);
      for (const line of lines) {
        fragments.push({ type: "text", text: line, startOffset });
      }
    };

    while ((match = imageRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const preceding = content.substring(lastIndex, match.index);
        pushTextLines(preceding, segmentStart + lastIndex);
      }

      if (match[2]) {
        const parsedLink = this.parseMarkdownImageLink(match[2]);
        fragments.push({
          type: "image",
          alt: match[1] || "",
          link: parsedLink,
          startOffset: segmentStart + match.index,
        });
      } else {
        const target = match[3]?.trim() ?? "";
        const alt = (match[4] ?? "").trim();
        fragments.push({
          type: "image",
          alt: alt || target,
          link: target,
          startOffset: segmentStart + match.index,
        });
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const trailing = content.substring(lastIndex);
      pushTextLines(trailing, segmentStart + lastIndex);
    }

    return fragments;
  }

  private findHeadingLineEnd(content: string, relativeStart: number): number {
    let end = content.indexOf("\n", relativeStart);
    if (end === -1) {
      return content.length;
    }

    let next = end + 1;
    while (next < content.length && content[next] === "\n") {
      next++;
    }

    return next;
  }

  private tokenizeLines(text: string): string[] {
    return text
      .replace(/\r\n/g, "\n")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => this.sanitizeLine(line))
      .filter((line) => line.length > 0);
  }

  private sanitizeLine(line: string): string {
    return line
      .replace(/^#{1,6}\s+/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/>\s*/g, "")
      .replace(/\!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/==\w+:[^=]+==/g, "") // Remove flags
      .replace(/%%[^%]+%%/g, "") // Remove comments
      .trim();
  }

  private resolveImageSrc(link: string): string | null {
    let trimmed = link.trim();
    if (!trimmed) {
      return null;
    }

    if (/^(app:|https?:|data:)/i.test(trimmed)) {
      return trimmed;
    }

    const normalized = trimmed.replace(/\\/g, "/");
    const [pathPart] = normalized.split("#");
    const targetFile = this.options.app.metadataCache.getFirstLinkpathDest(
      pathPart,
      this.options.sourcePath,
    );
    if (targetFile instanceof TFile) {
      return this.options.app.vault.getResourcePath(targetFile);
    }

    // Attempt to resolve standard markdown links relative to vault root
    const fallbackFile = this.options.app.metadataCache.getFirstLinkpathDest(
      trimmed,
      this.options.sourcePath,
    );
    if (fallbackFile instanceof TFile) {
      return this.options.app.vault.getResourcePath(fallbackFile);
    }

    // Last resort: return encoded original link so external paths still render
    try {
      return encodeURI(trimmed);
    } catch (error) {
      console.warn(
        "MiniMapRenderer: Failed to encode image link",
        trimmed,
        error,
      );
      return trimmed;
    }
  }

  private parseMarkdownImageLink(spec: string): string {
    let trimmed = spec.trim();
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    const titleMatch = trimmed.match(/\s+(".*"|'.*'|\(.*\))$/);
    if (titleMatch && titleMatch.index !== undefined) {
      trimmed = trimmed.substring(0, titleMatch.index).trim();
    }

    return trimmed;
  }

  private computeHeadingNumbers(): void {
    this.headingNumberMap.clear();
    this.headingEntries = [];
    const counters = [0, 0, 0, 0, 0, 0];

    for (const page of this.pages) {
      if (!page.headings) continue;

      for (const heading of page.headings) {
        const level = Math.min(Math.max(heading.level, 1), 6);
        const index = level - 1;
        counters[index] += 1;
        for (let i = index + 1; i < counters.length; i++) {
          counters[i] = 0;
        }

        const parts = [] as string[];
        for (let i = 0; i <= index; i++) {
          if (counters[i] === 0) continue;
          parts.push(String(counters[i]));
        }

        const numbering = parts.join(".");
        this.headingNumberMap.set(heading.startOffset, numbering);
      }
    }
  }

  private computeHeadingCalloutStacks(): void {
    this.headingCalloutStacks = computeHeadingCalloutStacks(this.pages);
  }

  private setActiveHeading(element: HTMLElement | null): void {
    if (this.activeHeadingEl === element) {
      return;
    }

    if (this.activeHeadingEl) {
      this.activeHeadingEl.removeClass("is-active");
    }

    this.activeHeadingEl = element;

    if (this.activeHeadingEl) {
      this.activeHeadingEl.addClass("is-active");
    }
  }

  highlightHeadingForOffset(offset: number): void {
    if (this.headingEntries.length === 0) {
      this.setActiveHeading(null);
      return;
    }

    let candidate: HTMLElement | null = this.headingEntries[0].element;
    for (const entry of this.headingEntries) {
      if (entry.offset <= offset) {
        candidate = entry.element;
      } else {
        break;
      }
    }

    this.setActiveHeading(candidate);
  }

  private applyBaseStyles(): void {
    if (!this.contentWrapperEl) {
      return;
    }

    const bodyFontSize = this.minimapFonts.body;
    const lineHeight = 1.25;
    const headingBase = this.minimapFonts.heading;
    const flagFont = this.minimapFonts.flag;

    this.contentWrapperEl.style.setProperty(
      "--long-view-minimap-font-size",
      `${bodyFontSize}px`,
    );
    this.contentWrapperEl.style.setProperty(
      "--long-view-minimap-line-height",
      lineHeight.toFixed(2),
    );
    this.contentWrapperEl.style.setProperty(
      "--long-view-minimap-heading-font-base",
      `${headingBase}px`,
    );
    this.contentWrapperEl.style.setProperty(
      "--long-view-minimap-flag-font-size",
      `${flagFont}px`,
    );
    this.contentWrapperEl.style.setProperty(
      "--long-view-minimap-gap",
      `${this.minimapLineGap}px`,
    );
  }

  private isSectionFlagHidden(type?: string): boolean {
    if (!type) return false;
    return this.hiddenSectionFlags.has(type.toLowerCase());
  }

  private shouldRenderCalloutBackground(type: string): boolean {
    if (!type) return false;
    const lower = type.toLowerCase();
    if (lower === "summary") {
      return false;
    }
    return !this.hiddenSectionFlags.has(lower);
  }

  private applyCalloutBackgroundTint(
    element: HTMLElement,
    color: string,
    type: string,
  ): void {
    const tintAlpha = type.toLowerCase() === "summary" ? 0.08 : 0.15;
    const rgb = this.parseColorToRgb(color);
    if (rgb) {
      const { r, g, b } = rgb;
      element.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${tintAlpha})`;
      return;
    }
    element.style.backgroundColor = color;
    element.style.opacity = tintAlpha.toString();
  }

  private parseColorToRgb(
    color: string,
  ): { r: number; g: number; b: number } | null {
    if (!color) return null;
    const trimmed = color.trim();
    const rgbMatch = trimmed.match(
      /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
    );
    if (rgbMatch) {
      return {
        r: Number(rgbMatch[1]),
        g: Number(rgbMatch[2]),
        b: Number(rgbMatch[3]),
      };
    }
    const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hexMatch) return null;
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    const intVal = parseInt(hex, 16);
    return {
      r: (intVal >> 16) & 0xff,
      g: (intVal >> 8) & 0xff,
      b: intVal & 0xff,
    };
  }

  cleanup(): void {
    this.sections = [];
    this.headingNumberMap.clear();
    this.headingCalloutStacks.clear();
    this.headingEntries = [];
    this.activeHeadingEl = null;
    this.currentHeadingLevel = 0;
    this.currentCalloutStack = [];

    if (this.minimapRootEl) {
      this.minimapRootEl.remove();
      this.minimapRootEl = null;
      this.contentWrapperEl = null;
    }
  }

  onunload(): void {
    this.cleanup();
  }
}
