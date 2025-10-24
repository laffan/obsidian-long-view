import { Plugin, WorkspaceLeaf } from "obsidian";
import chroma from "./utils/chroma";
import { LongView, LONG_VIEW_TYPE } from "./ui/LongView";
import {
  LongViewSettings,
  DEFAULT_SETTINGS,
  DEFAULT_FLAG_COLORS,
  DEFAULT_SECTION_FLAG_COLORS,
} from "./settings";
import {
  createFlagHighlightExtension,
  processRenderedFlags,
} from "./flags/flagStyling";
import { setFlagColorMap } from "./flags/flagColors";
import { setSectionFlagColorMap } from "./flags/sectionFlagColors";
import { LongViewSettingTab } from "./settingsTab";

export default class LongViewPlugin extends Plugin {
  settings: LongViewSettings;
  private flagStyleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();
    setFlagColorMap(this.settings.flagColors);
    setSectionFlagColorMap(this.settings.sectionFlagColors);
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
    this.settings.sectionFlagColors = Object.assign(
      {},
      DEFAULT_SECTION_FLAG_COLORS,
      persisted?.sectionFlagColors ?? {},
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
    const persistedSectionCustom = Array.isArray(persisted?.customSectionFlags)
      ? persisted.customSectionFlags
      : DEFAULT_SETTINGS.customSectionFlags;
    const normalizedSectionCustom = persistedSectionCustom
      .map((cf: any) => ({
        name: String(cf?.name || "").toUpperCase(),
        color: String(
          cf?.color ||
            this.settings.sectionFlagColors[
              String(cf?.name || "").toUpperCase()
            ] ||
            "#086ddd",
        ),
      }))
      .filter((cf: { name: string; color: string }) => {
        const upper = cf.name.toUpperCase();
        if (!upper) return false;
        if (upper === "SUMMARY") return false;
        return !(upper in DEFAULT_SECTION_FLAG_COLORS);
      });
    this.settings.customSectionFlags = normalizedSectionCustom;
    for (const cf of normalizedSectionCustom) {
      this.settings.sectionFlagColors[cf.name.toUpperCase()] = cf.color;
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
    if (typeof persisted?.includeImagesInMinimap !== "boolean") {
      this.settings.includeImagesInMinimap =
        DEFAULT_SETTINGS.includeImagesInMinimap;
    }
    if (!Array.isArray(persisted?.minimapHiddenFlags)) {
      this.settings.minimapHiddenFlags = [
        ...DEFAULT_SETTINGS.minimapHiddenFlags,
      ];
    } else {
      // Normalize to uppercase and unique
      const set = new Set<string>(
        (persisted!.minimapHiddenFlags as string[]).map((s) =>
          String(s || "").toUpperCase(),
        ),
      );
      this.settings.minimapHiddenFlags = Array.from(set);
    }
    if (!Array.isArray(persisted?.minimapHiddenSectionFlags)) {
      this.settings.minimapHiddenSectionFlags = [
        ...DEFAULT_SETTINGS.minimapHiddenSectionFlags,
      ];
    } else {
      const sectionSet = new Set<string>(
        (persisted!.minimapHiddenSectionFlags as string[]).map((s) =>
          String(s || "").toUpperCase(),
        ),
      );
      this.settings.minimapHiddenSectionFlags = Array.from(sectionSet);
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
    css += this.generateSectionCalloutStyles();
    return css;
  }

  private generateSectionCalloutStyles(): string {
    const sectionColorMap = this.settings.sectionFlagColors || {};
    const customSectionTypes = new Set(
      (this.settings.customSectionFlags || []).map((cf) =>
        String(cf?.name || "").toUpperCase(),
      ),
    );

    let css = "";

    const summaryColor = sectionColorMap.SUMMARY || "#b8b8b8";
    css += this.buildCalloutStyle("SUMMARY", summaryColor, true);

    for (const type of customSectionTypes) {
      if (!type || type === "SUMMARY") continue;
      const color = sectionColorMap[type] || "#086ddd";
      css += this.buildCalloutStyle(type, color, false);
    }

    return css;
  }

  private buildCalloutStyle(
    type: string,
    color: string,
    isSummary: boolean,
  ): string {
    const typeLower = type.toLowerCase();
    const accent = color || "#086ddd";
    const bgAlpha = isSummary ? 0.08 : 0.08;
    const borderAlpha = isSummary ? 0.18 : 0.22;
    const titleBgAlpha = isSummary ? bgAlpha : 0.12;
    const background = toRgba(accent, bgAlpha);
    const border = toRgba(accent, borderAlpha);
    const titleBg = isSummary ? background : toRgba(accent, titleBgAlpha);
    const titleColor = accent;

    let css = `
.callout[data-callout="${typeLower}"],
.markdown-source-view.mod-cm6 .cm-callout[data-callout="${typeLower}"] {
  --callout-color: ${accent};
  --callout-border-color: ${border};
  --callout-bg: ${background};
  --callout-title-bg: transparent;
  --callout-title-color: ${titleColor};
  background-color: ${background};
  border-color: ${border};
  --callout-icon: none;
}
`;

    css += `
.callout[data-callout="${typeLower}"] > .callout-title,
.markdown-source-view.mod-cm6 .cm-callout[data-callout="${typeLower}"] > .callout-title {
  background-color: transparent;
  color: ${titleColor};
}
.callout[data-callout="${typeLower}"] .callout-icon,
.markdown-source-view.mod-cm6 .cm-callout[data-callout="${typeLower}"] .callout-icon {
  display: none;
}
`;

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
