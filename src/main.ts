import { Plugin, WorkspaceLeaf } from "obsidian";
import chroma from "./utils/chroma";
import { LongView, LONG_VIEW_TYPE } from "./ui/LongView";
import {
  LongViewSettings,
  DEFAULT_SETTINGS,
  DEFAULT_FLAG_COLORS,
} from "./settings";
import {
  createFlagHighlightExtension,
  processRenderedFlags,
} from "./flags/flagStyling";
import { setFlagColorMap } from "./flags/flagColors";
import { LongViewSettingTab } from "./settingsTab";

export default class LongViewPlugin extends Plugin {
  settings: LongViewSettings;
  private flagStyleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();
    setFlagColorMap(this.settings.flagColors);
    this.applyFlagStyles();

    // Style inline flags inside the main editor and reading view
    this.registerEditorExtension(createFlagHighlightExtension());
    this.registerMarkdownPostProcessor((element, context) => {
      processRenderedFlags(element, context);
    });

    this.addSettingTab(new LongViewSettingTab(this.app, this));

    // Register the custom view
    this.registerView(LONG_VIEW_TYPE, (leaf) => new LongView(leaf, this));

    // Add ribbon icon to open the view
    this.addRibbonIcon("layout-grid", "Open Long View", () => {
      this.activateView();
    });

    // Add command to open the view
    this.addCommand({
      id: "open-long-view",
      name: "Open Long View",
      callback: () => {
        this.activateView();
      },
    });
  }

  onunload() {
    // Detach all leaves of our custom view type
    this.app.workspace.detachLeavesOfType(LONG_VIEW_TYPE);
    if (this.flagStyleEl) {
      this.flagStyleEl.remove();
      this.flagStyleEl = null;
    }
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(LONG_VIEW_TYPE);

    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0];
    } else {
      // Our view could not be found in the workspace, create a new leaf
      // in the right sidebar for it
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: LONG_VIEW_TYPE, active: true });
      }
    }

    // Reveal the leaf in case it is in a collapsed sidebar
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    const persisted = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, persisted);
    // Merge flag colors with defaults
    this.settings.flagColors = Object.assign(
      {},
      DEFAULT_FLAG_COLORS,
      persisted?.flagColors ?? {},
    );
    // Ensure custom flags list exists and synchronize colors
    const persistedCustom = Array.isArray(persisted?.customFlags)
      ? persisted.customFlags
      : DEFAULT_SETTINGS.customFlags;
    this.settings.customFlags = persistedCustom.map((cf: any) => ({
      name: String(cf?.name || "").toUpperCase(),
      color: String(
        cf?.color ||
          this.settings.flagColors[String(cf?.name || "").toUpperCase()] ||
          "#66aaff",
      ),
    }));
    // Ensure mapping contains custom flags
    for (const cf of this.settings.customFlags) {
      this.settings.flagColors[cf.name.toUpperCase()] = cf.color;
    }
    // Other settings
    this.settings.minimapFontSizes = Object.assign(
      {},
      DEFAULT_SETTINGS.minimapFontSizes,
      persisted?.minimapFontSizes ?? {},
    );
    this.settings.minimapLineGap =
      typeof persisted?.minimapLineGap === "number"
        ? persisted.minimapLineGap
        : DEFAULT_SETTINGS.minimapLineGap;
    if (typeof persisted?.includeCommentsInMinimap !== "boolean") {
      this.settings.includeCommentsInMinimap =
        DEFAULT_SETTINGS.includeCommentsInMinimap;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public applyFlagStyles(): void {
    const css = this.generateFlagStyles();
    if (!this.flagStyleEl) {
      this.flagStyleEl = document.createElement("style");
      this.flagStyleEl.id = "long-view-flag-styles";
      this.flagStyleEl.setAttribute("data-long-view", "flag-styles");
      document.head.appendChild(this.flagStyleEl);
    }
    this.flagStyleEl.textContent = css;
  }

  public async refreshOpenViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(LONG_VIEW_TYPE);
    await Promise.all(
      leaves.map(async (leaf) => {
        const view = leaf.view;
        if (view instanceof LongView) {
          await view.updateView();
        }
      }),
    );
  }

  private generateFlagStyles(): string {
    const colorMap = this.settings.flagColors;
    let css = "";
    for (const key of Object.keys(colorMap)) {
      const type = key.toUpperCase();
      const color = colorMap[type];
      if (!color) continue;
      const typeLower = type.toLowerCase();
      const textColor = getContrastingTextColor(color);
      if (type === "MISSING") {
        const borderColor = color;
        const bg = toRgba(color, 0.12);
        const inlineBg = "transparent";
        const missingText = color;
        css += `
	.long-view-minimap-flag.is-missing-flag { border-color: ${borderColor}; color: ${missingText}; }
	.long-view-minimap-flag.is-missing-flag .long-view-minimap-flag-message { color: ${missingText}; }
	.long-view-flag-bar.is-missing-flag { border-color: ${borderColor}; background-color: ${bg}; color: ${missingText}; }
	.markdown-preview-view mark.long-view-inline-flag.is-missing-flag,
	.cm-content .long-view-inline-flag.is-missing-flag { border-color: ${borderColor}; background-color: ${inlineBg} !important; color: ${missingText} !important; }
	`;
        continue;
      }

      const minimapBg = color;
      const pagedBg = color;
      const inlineBg = color;
      css += `
	.long-view-minimap-flag.long-view-flag-type-${typeLower} { background-color: ${minimapBg}; color: ${textColor}; }
	.long-view-minimap-flag.long-view-flag-type-${typeLower} .long-view-minimap-flag-message { color: ${textColor}; }
	.long-view-page-content .long-view-flag-bar.long-view-flag-type-${typeLower} { background-color: ${pagedBg}; color: ${textColor}; }
	.markdown-preview-view mark.long-view-inline-flag.long-view-inline-flag-${typeLower},
	.cm-content .long-view-inline-flag.long-view-inline-flag-${typeLower} { background-color: ${inlineBg} !important; color: ${textColor} !important; }
	`;
    }
    return css;
  }
}

function toRgba(hex: string, alpha: number): string {
  try {
    return chroma(hex).alpha(alpha).css();
  } catch (error) {
    return hex;
  }
}

function getContrastingTextColor(hex: string): string {
  try {
    const color = chroma(hex);
    const contrastWhite = chroma.contrast(color, "#ffffff");
    const contrastBlack = chroma.contrast(color, "#1a1a1a");
    return contrastWhite >= contrastBlack ? "#ffffff" : "#1a1a1a";
  } catch (error) {
    return "#1a1a1a";
  }
}
