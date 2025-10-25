import {
  ItemView,
  MarkdownView,
  TFile,
  WorkspaceLeaf,
  Menu,
  ToggleComponent,
} from "obsidian";
import {
  DocumentPage,
  computeHeadingCalloutStacks,
} from "../utils/documentParser";
import { paginateDocument } from "../utils/simplePagination";
import { buildMinimapSections } from "../utils/minimapParser";
import { MiniMapRenderer } from "./miniMapRenderer";
import { renderPageContent } from "./simplePageRenderer";
import { ViewMode } from "../settings";
import { getFlagColor } from "../flags/flagColors";
import { getSectionFlagColor } from "../flags/sectionFlagColors";
import type LongViewPlugin from "../main";

export const LONG_VIEW_TYPE = "long-view";

export class LongView extends ItemView {
  plugin: LongViewPlugin;
  private pages: DocumentPage[] = [];
  private minimapSections: DocumentPage[] = [];
  private contentContainerEl: HTMLElement;
  private currentFile: TFile | null = null;
  private minimapRenderer: MiniMapRenderer | null = null;
  private editorScrollEl: HTMLElement | null = null;
  private activeLeaf: WorkspaceLeaf | null = null;
  private documentLength = 0;
  private readonly onEditorScroll = () => this.updateActiveHeading();
  private currentMode: ViewMode = "minimap";
  private currentZoom: number = 15;
  private modeButtonsEl: HTMLElement | null = null;
  private zoomControlEl: HTMLElement | null = null;
  private filtersContainerEl: HTMLElement | null = null;
  private filtersPanelEl: HTMLElement | null = null;
  private filtersButtonEl: HTMLElement | null = null;
  private linkedLeafId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LongViewPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return LONG_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Long View";
  }

  getIcon(): string {
    return "layout-grid";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();
    container.addClass("long-view-container");

    // Restore ephemeral link state if available
    try {
      const state = (this.leaf as any).getEphemeralState?.();
      if (state && typeof state.linkedLeafId === "string") {
        this.linkedLeafId = state.linkedLeafId;
      }
    } catch (e) {
      // ignore
    }

    // Create header with mode buttons and zoom control
    const headerEl = container.createDiv({ cls: "long-view-header" });

    // Mode switcher buttons
    this.modeButtonsEl = headerEl.createDiv({ cls: "long-view-mode-buttons" });

    const minimapBtn = this.modeButtonsEl.createEl("button", {
      text: "Minimap",
      cls: "long-view-mode-button",
    });
    const pagedBtn = this.modeButtonsEl.createEl("button", {
      text: "Paged",
      cls: "long-view-mode-button",
    });

    // Refresh button
    const refreshBtn = this.modeButtonsEl.createEl("button", {
      text: "♻️",
      cls: "long-view-refresh-button",
      attr: {
        "aria-label": "Refresh view",
      },
    });

    // Zoom control (only visible in paged mode)
    this.zoomControlEl = headerEl.createDiv({ cls: "long-view-zoom-control" });
    const zoomLabel = this.zoomControlEl.createSpan({
      cls: "long-view-zoom-label",
      text: `Zoom: ${this.currentZoom}%`,
    });
    const zoomSlider = this.zoomControlEl.createEl("input", {
      type: "range",
      cls: "long-view-zoom-slider",
      attr: {
        min: "5",
        max: "30",
        value: String(this.currentZoom),
      },
    });

    // Filters dropdown (only visible in minimap mode)
    this.filtersContainerEl = headerEl.createDiv({ cls: "long-view-filters" });
    this.filtersButtonEl = this.filtersContainerEl.createEl("a", {
      text: "Filters",
      cls: "long-view-filters-link",
      attr: { href: "#" },
    });
    this.filtersPanelEl = this.filtersContainerEl.createDiv({
      cls: "long-view-filters-panel",
    });

    // Initialize mode from settings
    this.currentMode = this.plugin.settings.viewMode;
    this.currentZoom = this.plugin.settings.defaultZoom;

    // Update UI state
    const updateModeUI = () => {
      minimapBtn.toggleClass("is-active", this.currentMode === "minimap");
      pagedBtn.toggleClass("is-active", this.currentMode === "paged");
      this.zoomControlEl?.toggleClass(
        "is-visible",
        this.currentMode === "paged",
      );
      this.filtersContainerEl?.toggleClass(
        "is-visible",
        this.currentMode === "minimap",
      );
    };

    updateModeUI();
    this.buildFiltersPanel();

    // Mode button handlers
    minimapBtn.addEventListener("click", () => {
      this.currentMode = "minimap";
      this.plugin.settings.viewMode = "minimap";
      this.plugin.saveSettings();
      updateModeUI();
      this.updateView();
    });

    pagedBtn.addEventListener("click", () => {
      this.currentMode = "paged";
      this.plugin.settings.viewMode = "paged";
      this.plugin.saveSettings();
      updateModeUI();
      this.updateView();
    });

    // Zoom slider handler
    zoomSlider.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.currentZoom = parseInt(target.value);
      zoomLabel.setText(`Zoom: ${this.currentZoom}%`);
      this.plugin.settings.defaultZoom = this.currentZoom;
      this.plugin.saveSettings();
      this.updateZoom();
    });

    // Filters button toggle handler
    this.filtersButtonEl.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.filtersPanelEl) {
        this.filtersPanelEl.classList.toggle("is-open");
      }
    });

    // Close filters when clicking outside
    const onDocClick = (e: MouseEvent) => {
      if (!this.filtersContainerEl) return;
      const target = e.target as HTMLElement;
      if (!this.filtersContainerEl.contains(target)) {
        this.filtersPanelEl?.removeClass("is-open");
      }
    };
    document.addEventListener("click", onDocClick, true);
    this.register(() =>
      document.removeEventListener("click", onDocClick, true),
    );

    // Refresh button handler
    refreshBtn.addEventListener("click", () => {
      this.updateView();
    });

    // Create main content area
    this.contentContainerEl = container.createDiv({ cls: "long-view-content" });

    // Initial render
    await this.updateView();

    // Register event to update when active file changes (only when not linked)
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (!this.linkedLeafId) this.updateView();
      }),
    );

    // Update when files open/replace to keep linked leaf in sync
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.updateView();
      }),
    );

    // Note: We do NOT update on editor-change for performance reasons
    // Users can manually refresh using the refresh button
  }

  async onClose(): Promise<void> {
    this.detachEditorScrollHandler();
    if (this.minimapRenderer) {
      this.minimapRenderer.unload();
      this.minimapRenderer = null;
    }
  }

  async updateView(): Promise<void> {
    let activeFile: TFile | null = null;
    if (this.linkedLeafId) {
      const linked = this.findLeafById(this.linkedLeafId);
      const view = linked?.view as MarkdownView | undefined;
      activeFile = view?.file ?? null;
    }
    if (!activeFile) {
      activeFile = this.app.workspace.getActiveFile();
    }

    if (!activeFile) {
      this.contentContainerEl.empty();
      this.contentContainerEl.createDiv({
        text: "No active document",
        cls: "long-view-empty",
      });
      this.currentFile = null;
      this.documentLength = 0;
      return;
    }

    this.currentFile = activeFile;
    const content = await this.app.vault.read(activeFile);
    this.documentLength = content.length;

    // Parse for both view modes independently so each gets optimal chunking
    console.log("Long View: Parsing document...");
    const pagedStart = Date.now();
    this.pages = paginateDocument(content);
    const pagedDuration = Date.now() - pagedStart;
    const minimapStart = Date.now();
    this.minimapSections = buildMinimapSections(content);
    const minimapDuration = Date.now() - minimapStart;
    console.log(
      `Long View: Paged view created ${this.pages.length} sections in ${pagedDuration}ms`,
    );
    console.log(
      `Long View: Minimap view created ${this.minimapSections.length} section(s) in ${minimapDuration}ms`,
    );

    // Render based on current mode
    if (this.currentMode === "paged") {
      await this.renderPaged(activeFile);
    } else {
      // Update filters UI with used flags from current doc
      this.buildFiltersPanel();
      await this.renderMinimap(activeFile);
      this.bindToActiveEditor();
    }
  }

  private buildFiltersPanel(): void {
    if (!this.filtersPanelEl) return;
    // Clear previous
    this.filtersPanelEl.empty();

    // Helper to create a row with label on left and a toggle on right
    const addToggleRow = (opts: {
      key: string;
      label: string;
      checked: boolean;
      onChange: (val: boolean) => void;
      prefixDotColor?: string;
    }) => {
      const row = this.filtersPanelEl!.createDiv({
        cls: "long-view-filter-row",
      });
      const left = row.createDiv({ cls: "long-view-filter-left" });
      if (opts.prefixDotColor) {
        const dot = left.createSpan({ cls: "long-view-filter-dot" });
        dot.style.backgroundColor = opts.prefixDotColor;
      }
      left.createSpan({ text: opts.label });
      const right = row.createDiv({ cls: "long-view-filter-right" });
      const toggle = new ToggleComponent(right);
      toggle.setValue(opts.checked);
      toggle.onChange((val) => opts.onChange(!!val));
      return row;
    };

    // Static toggles
    addToggleRow({
      key: "text",
      label: "Text",
      checked: !!this.plugin.settings.showParagraphsInMinimap,
      onChange: async (val) => {
        this.plugin.settings.showParagraphsInMinimap = val;
        await this.plugin.saveSettings();
        await this.updateView();
      },
    });

    addToggleRow({
      key: "numbers",
      label: "Numbers",
      checked: !!this.plugin.settings.numberSections,
      onChange: async (val) => {
        this.plugin.settings.numberSections = val;
        await this.plugin.saveSettings();
        await this.updateView();
      },
    });

    addToggleRow({
      key: "images",
      label: "Images",
      checked: !!this.plugin.settings.includeImagesInMinimap,
      onChange: async (val) => {
        this.plugin.settings.includeImagesInMinimap = val;
        await this.plugin.saveSettings();
        await this.updateView();
      },
    });

    addToggleRow({
      key: "comments",
      label: "Comments",
      checked: !!this.plugin.settings.includeCommentsInMinimap,
      onChange: async (val) => {
        this.plugin.settings.includeCommentsInMinimap = val;
        await this.plugin.saveSettings();
        await this.updateView();
      },
    });

    // Toggle for showing flag/callout TYPE labels in the minimap (excludes COMMENT and SUMMARY)
    addToggleRow({
      key: "types",
      label: "Types",
      checked: !!this.plugin.settings.showFlagTypesInMinimap,
      onChange: async (val) => {
        this.plugin.settings.showFlagTypesInMinimap = val;
        await this.plugin.saveSettings();
        await this.updateView();
      },
    });

    const usedLineFlags = new Set<string>();
    const usedSectionFlags = new Set<string>();

    try {
      for (const section of this.minimapSections) {
        for (const heading of section.headings || []) {
          const type = heading.callout?.type;
          if (type) {
            usedSectionFlags.add(String(type || "").toUpperCase());
          }
        }
        for (const flag of section.flags || []) {
          const flagType = String(flag.type || "").toUpperCase();
          if (flagType === "COMMENT") continue;
          usedLineFlags.add(flagType);
        }
      }
    } catch (e) {
      // ignore
    }

    const sortedLineFlags = Array.from(usedLineFlags).sort();
    const sortedSectionFlags = Array.from(usedSectionFlags).sort();

    const getHiddenLineFlags = () =>
      new Set(
        (this.plugin.settings.minimapHiddenFlags || []).map((s) =>
          String(s || "").toUpperCase(),
        ),
      );
    const getHiddenSectionFlags = () =>
      new Set(
        (this.plugin.settings.minimapHiddenSectionFlags || []).map((s) =>
          String(s || "").toUpperCase(),
        ),
      );

    const haveAnyFlagGroups =
      sortedLineFlags.length > 0 || sortedSectionFlags.length > 0;

    if (haveAnyFlagGroups) {
      this.filtersPanelEl.createDiv({ cls: "long-view-filter-sep" });
    }

    if (sortedLineFlags.length > 0) {
      const hiddenLines = getHiddenLineFlags();
      const anyLineVisible = sortedLineFlags.some(
        (flag) => !hiddenLines.has(flag),
      );
      addToggleRow({
        key: "line-flags-toggle",
        label: "All line flags",
        checked: anyLineVisible,
        onChange: async (val) => {
          const updated = getHiddenLineFlags();
          if (val) {
            sortedLineFlags.forEach((flag) => updated.delete(flag));
          } else {
            sortedLineFlags.forEach((flag) => updated.add(flag));
          }
          this.plugin.settings.minimapHiddenFlags = Array.from(updated);
          await this.plugin.saveSettings();
          await this.updateView();
        },
      });
    }

    if (sortedSectionFlags.length > 0) {
      const hiddenSections = getHiddenSectionFlags();
      const anySectionVisible = sortedSectionFlags.some(
        (flag) => !hiddenSections.has(flag),
      );
      addToggleRow({
        key: "section-flags-toggle",
        label: "All section flags",
        checked: anySectionVisible,
        onChange: async (val) => {
          const updated = getHiddenSectionFlags();
          if (val) {
            sortedSectionFlags.forEach((flag) => updated.delete(flag));
          } else {
            sortedSectionFlags.forEach((flag) => updated.add(flag));
          }
          this.plugin.settings.minimapHiddenSectionFlags = Array.from(updated);
          await this.plugin.saveSettings();
          await this.updateView();
        },
      });
    }

    if (sortedLineFlags.length > 0) {
      this.filtersPanelEl.createDiv({ cls: "long-view-filter-sep" });
      this.filtersPanelEl.createDiv({
        cls: "long-view-filter-group-title",
        text: "Line flags",
      });
      const hiddenLineFlags = getHiddenLineFlags();
      for (const flagType of sortedLineFlags) {
        const color = getFlagColor(flagType);
        const isVisible = !hiddenLineFlags.has(flagType);
        addToggleRow({
          key: `flag-${flagType}`,
          label: flagType,
          checked: isVisible,
          prefixDotColor: color,
          onChange: async (val) => {
            const updated = getHiddenLineFlags();
            if (val) {
              updated.delete(flagType);
            } else {
              updated.add(flagType);
            }
            this.plugin.settings.minimapHiddenFlags = Array.from(updated);
            await this.plugin.saveSettings();
            await this.updateView();
          },
        });
      }
    }

    if (sortedLineFlags.length > 0 && sortedSectionFlags.length > 0) {
      this.filtersPanelEl.createDiv({ cls: "long-view-filter-sep" });
    }

    if (sortedSectionFlags.length > 0) {
      this.filtersPanelEl.createDiv({
        cls: "long-view-filter-group-title",
        text: "Section flags",
      });
      const hiddenSectionFlags = getHiddenSectionFlags();
      for (const sectionType of sortedSectionFlags) {
        const color = getSectionFlagColor(sectionType);
        const isVisible = !hiddenSectionFlags.has(sectionType);
        addToggleRow({
          key: `section-${sectionType}`,
          label: sectionType,
          checked: isVisible,
          prefixDotColor: sectionType === "SUMMARY" ? "#b0b0b0" : color,
          onChange: async (val) => {
            const updated = getHiddenSectionFlags();
            if (val) {
              updated.delete(sectionType);
            } else {
              updated.add(sectionType);
            }
            this.plugin.settings.minimapHiddenSectionFlags =
              Array.from(updated);
            await this.plugin.saveSettings();
            await this.updateView();
          },
        });
      }
    }
  }

  private async renderMinimap(file: TFile): Promise<void> {
    this.detachEditorScrollHandler();
    this.contentContainerEl.empty();
    this.contentContainerEl.addClass("long-view-minimap-mode");
    this.contentContainerEl.removeClass("long-view-paged-mode");

    if (this.minimapRenderer) {
      this.minimapRenderer.unload();
      this.minimapRenderer = null;
    }

    if (this.minimapSections.length === 0) {
      this.contentContainerEl.createDiv({
        text: "Document is empty",
        cls: "long-view-empty",
      });
      return;
    }

    this.minimapRenderer = new MiniMapRenderer({
      app: this.app,
      containerEl: this.contentContainerEl,
      sourcePath: file.path,
      onSectionClick: (offset) => this.scrollToOffset(offset),
      onHeadingClick: (offset) => this.scrollToOffset(offset),
      showParagraphs: this.plugin.settings.showParagraphsInMinimap,
      numberSections: this.plugin.settings.numberSections,
      minimapFonts: this.plugin.settings.minimapFontSizes,
      minimapLineGap: this.plugin.settings.minimapLineGap,
      includeComments: this.plugin.settings.includeCommentsInMinimap,
      includeImages: this.plugin.settings.includeImagesInMinimap,
      includeFlagTypes: this.plugin.settings.showFlagTypesInMinimap,
      hiddenFlags: new Set(
        (this.plugin.settings.minimapHiddenFlags || []).map((s) =>
          String(s || "").toLowerCase(),
        ),
      ),
      hiddenSectionFlags: new Set(
        (this.plugin.settings.minimapHiddenSectionFlags || []).map((s) =>
          String(s || "").toLowerCase(),
        ),
      ),
    });

    await this.minimapRenderer.initialize(this.minimapSections);
    this.minimapRenderer.highlightHeadingForOffset(0);

    console.log(
      `Long View: Rendered minimap with ${this.minimapSections.length} section(s)`,
    );
  }

  private async renderPaged(file: TFile): Promise<void> {
    this.detachEditorScrollHandler();
    this.contentContainerEl.empty();
    this.contentContainerEl.addClass("long-view-paged-mode");
    this.contentContainerEl.removeClass("long-view-minimap-mode");

    if (this.minimapRenderer) {
      this.minimapRenderer.unload();
      this.minimapRenderer = null;
    }

    if (this.pages.length === 0) {
      this.contentContainerEl.createDiv({
        text: "Document is empty",
        cls: "long-view-empty",
      });
      return;
    }

    const grid = this.contentContainerEl.createDiv({ cls: "long-view-grid" });

    // Apply initial zoom and layout before rendering content
    const scale = this.currentZoom / 100;
    grid.style.transform = `scale(${scale})`;
    grid.style.transformOrigin = "top left";

    // Compute callout stacks for all headings once
    const headingCalloutStacks = computeHeadingCalloutStacks(this.pages);

    for (const page of this.pages) {
      const pageEl = grid.createDiv({ cls: "long-view-page" });
      pageEl.setAttribute("data-page", String(page.pageNumber));

      // Add page number overlay in upper left
      // Font size scales inversely with zoom to always appear ~12px
      const pageNumberEl = pageEl.createDiv({ cls: "long-view-page-number" });
      pageNumberEl.setText(String(page.pageNumber + 1));
      const scaledFontSize = 12 / (this.currentZoom / 100);
      pageNumberEl.style.fontSize = `${scaledFontSize}px`;

      // Content container
      const contentEl = pageEl.createDiv({ cls: "long-view-page-content" });

      // Use simple fast renderer instead of full MarkdownRenderer
      try {
        renderPageContent(
          page.content,
          contentEl,
          this.currentZoom,
          this.app,
          file.path,
          page.headings,
          headingCalloutStacks,
        );
      } catch (error) {
        console.error("Long View: Error rendering page:", error);
        // Fallback to plain text if rendering fails
        contentEl.setText(page.content);
      }

      // Make page clickable to scroll to location in editor
      pageEl.addEventListener("click", (event) => {
        // Don't trigger if clicking a flag
        if ((event.target as HTMLElement).closest(".long-view-page-flag")) {
          return;
        }
        this.scrollToOffset(page.startOffset);
      });
    }

    // Update column layout after content is rendered
    requestAnimationFrame(() => {
      this.updateZoom();
    });

    console.log(`Long View: Rendered ${this.pages.length} pages in paged mode`);
  }

  private updateZoom(): void {
    if (this.currentMode !== "paged") {
      return;
    }

    const grid = this.contentContainerEl.querySelector(
      ".long-view-grid",
    ) as HTMLElement;
    if (!grid) return;

    // Apply transform scale to the entire grid (camera zoom effect)
    const scale = this.currentZoom / 100;
    grid.style.transform = `scale(${scale})`;
    grid.style.transformOrigin = "top left";

    // Calculate how many columns can fit based on zoom level
    const pageWidth = 1275;
    const gap = 100;
    const containerWidth = this.contentContainerEl.clientWidth - 40; // minus padding

    // Calculate effective page width after scaling
    const effectivePageWidth = pageWidth * scale;
    const effectiveGap = gap * scale;

    // Calculate how many columns fit
    const columnsToFit = Math.max(
      1,
      Math.floor(
        (containerWidth + effectiveGap) / (effectivePageWidth + effectiveGap),
      ),
    );

    // Update grid to show that many columns
    grid.style.gridTemplateColumns = `repeat(${columnsToFit}, ${pageWidth}px)`;

    // Update page number font sizes to maintain ~12px apparent size
    const pageNumbers = grid.querySelectorAll(
      ".long-view-page-number",
    ) as NodeListOf<HTMLElement>;
    const scaledFontSize = 12 / scale;
    pageNumbers.forEach((pageNumber) => {
      pageNumber.style.fontSize = `${scaledFontSize}px`;
    });

    console.log(
      `Long View: Zoom ${this.currentZoom}%, fitting ${columnsToFit} columns (effective width: ${effectivePageWidth}px)`,
    );
  }

  private scrollToOffset(offset: number): void {
    if (!this.currentFile) {
      console.log("Long View: No current file");
      return;
    }

    const context = this.findMarkdownContext();
    if (!context) {
      console.log(
        "Long View: No markdown view found for file:",
        this.currentFile?.path,
      );
      return;
    }

    const { leaf, view } = context;
    const editor = view.editor;
    if (!editor) {
      console.log("Long View: No editor found in markdown view");
      return;
    }

    // Use editor's built-in offsetToPos method for accurate conversion
    let targetPos: { line: number; ch: number };

    // Check if editor has offsetToPos method
    if (typeof (editor as any).offsetToPos === "function") {
      targetPos = (editor as any).offsetToPos(offset);
      console.log(
        `Long View: Using offsetToPos - scrolling to offset ${offset} -> line ${targetPos.line}, ch ${targetPos.ch}`,
      );
    } else {
      // Fallback: manually convert offset to position
      const content = editor.getValue();
      let currentOffset = 0;
      let line = 0;
      let ch = 0;

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (currentOffset + lineLength >= offset) {
          line = i;
          ch = offset - currentOffset;
          break;
        }
        currentOffset += lineLength + 1; // +1 for newline
      }

      targetPos = { line, ch };
      console.log(
        `Long View: Manual conversion - scrolling to offset ${offset} -> line ${targetPos.line}, ch ${targetPos.ch}`,
      );
    }

    // Set cursor to target position
    editor.setCursor(targetPos);

    // Use Obsidian's scrollIntoView with center option for better visibility
    // The 'center' option ensures the target is in the middle of the viewport, not at the top or bottom
    editor.scrollIntoView({ from: targetPos, to: targetPos }, true);

    // Reveal and focus the markdown view
    this.app.workspace.revealLeaf(leaf);
    this.bindToActiveEditor();
    this.minimapRenderer?.highlightHeadingForOffset(offset);
  }

  private bindToActiveEditor(): void {
    this.detachEditorScrollHandler();

    if (!this.minimapRenderer) {
      return;
    }

    const context = this.findMarkdownContext();
    if (!context) {
      return;
    }

    this.activeLeaf = context.leaf;
    const scrollElement = this.getScrollElementForView(context.view);
    if (!scrollElement) {
      console.log(
        "Long View: Unable to locate scroll element for markdown view",
      );
      return;
    }

    this.editorScrollEl = scrollElement;
    this.editorScrollEl.addEventListener("scroll", this.onEditorScroll, {
      passive: true,
    });
    this.updateActiveHeading();
  }

  private detachEditorScrollHandler(): void {
    if (this.editorScrollEl) {
      this.editorScrollEl.removeEventListener("scroll", this.onEditorScroll);
      this.editorScrollEl = null;
    }

    this.activeLeaf = null;
  }

  onPaneMenu(menu: Menu): void {
    this.addLinkWithTabMenu(menu);
  }

  // Back-compat for older Obsidian versions
  onMoreOptionsMenu(menu: Menu): void {
    this.addLinkWithTabMenu(menu);
  }

  private addLinkWithTabMenu(menu: Menu): void {
    const isLinked = !!this.linkedLeafId;
    const title = isLinked ? "Unlink from tab" : "Link with tab";
    menu.addItem((item) => {
      item
        .setTitle(title)
        .setIcon(isLinked ? "link-2-off" : "link")
        .onClick(() => {
          if (isLinked) {
            this.setLinkedLeaf(null);
          } else {
            const active = this.getActiveMarkdownLeaf();
            if (active) this.setLinkedLeaf((active as any).id);
          }
        });
    });
  }

  private setLinkedLeaf(id: string | null): void {
    this.linkedLeafId = id;
    try {
      const current = (this.leaf as any).getEphemeralState?.() || {};
      (this.leaf as any).setEphemeralState?.({ ...current, linkedLeafId: id });
    } catch (e) {
      // ignore
    }
    this.updateView();
  }

  private getActiveMarkdownLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const active = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
    if (active && leaves.includes(active)) return active;
    return leaves[0] ?? null;
  }

  private findLeafById(id: string): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      if ((leaf as any).id === id) return leaf;
    }
    return null;
  }

  private findMarkdownContext(): {
    leaf: WorkspaceLeaf;
    view: MarkdownView;
  } | null {
    if (!this.currentFile) {
      return null;
    }

    // Prefer the specifically linked leaf, if set
    if (this.linkedLeafId) {
      const leaf = this.findLeafById(this.linkedLeafId);
      const view = leaf?.view as MarkdownView | undefined;
      if (
        leaf &&
        view &&
        view.file &&
        view.file.path === this.currentFile.path
      ) {
        return { leaf, view } as any;
      }
    }

    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      if (view.file && view.file.path === this.currentFile.path) {
        return { leaf, view };
      }
    }

    return null;
  }

  private getScrollElementForView(view: MarkdownView): HTMLElement | null {
    const roots: HTMLElement[] = [];
    if (view.contentEl) roots.push(view.contentEl);
    if (view.containerEl && view.containerEl !== view.contentEl) {
      roots.push(view.containerEl);
    }

    for (const root of roots) {
      const livePreviewScroller =
        root.querySelector<HTMLElement>(".cm-scroller");
      if (livePreviewScroller) {
        return livePreviewScroller;
      }

      const readingScroller = root.querySelector<HTMLElement>(
        ".markdown-preview-view",
      );
      if (readingScroller) {
        return readingScroller;
      }
    }

    return null;
  }

  private updateActiveHeading(): void {
    if (!this.minimapRenderer) {
      return;
    }

    const context = this.findMarkdownContext();
    if (!context) {
      this.minimapRenderer.highlightHeadingForOffset(0);
      return;
    }

    const editor = context.view.editor;
    if (!editor) {
      this.minimapRenderer.highlightHeadingForOffset(0);
      return;
    }

    try {
      const anyEditor = editor as any;
      const viewport = anyEditor.getViewport?.();
      const posToOffset:
        | ((pos: { line: number; ch: number }) => number)
        | undefined =
        typeof anyEditor.posToOffset === "function"
          ? anyEditor.posToOffset.bind(anyEditor)
          : undefined;
      if (viewport && posToOffset) {
        const topLine = viewport.from ?? 0;
        const offset = posToOffset({ line: topLine, ch: 0 });
        this.minimapRenderer.highlightHeadingForOffset(offset);
        return;
      }
    } catch (error) {
      console.warn("Long View: Failed to derive viewport from editor", error);
    }

    const scrollEl = this.editorScrollEl;
    if (!scrollEl || this.documentLength === 0) {
      this.minimapRenderer.highlightHeadingForOffset(0);
      return;
    }

    const maxScroll = Math.max(
      1,
      scrollEl.scrollHeight - scrollEl.clientHeight,
    );
    const ratio = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;
    const approxOffset = Math.min(
      this.documentLength,
      Math.floor(this.documentLength * ratio),
    );
    this.minimapRenderer.highlightHeadingForOffset(approxOffset);
  }
}
