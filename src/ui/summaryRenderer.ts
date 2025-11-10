import { App, Component } from "obsidian";
import { FlagsByFolder, FlagInstance } from "../utils/vaultScanner";
import { getFlagColor } from "../flags/flagColors";
import chroma from "../utils/chroma";

export interface SummaryRendererOptions {
  app: App;
  containerEl: HTMLElement;
  flagsByFolder: FlagsByFolder;
  onFlagClick: (filePath: string, lineNumber: number) => void;
  hiddenFlags: Set<string>;
  fontSize: number;
  lineHeight: number;
}

export class SummaryRenderer extends Component {
  private app: App;
  private containerEl: HTMLElement;
  private flagsByFolder: FlagsByFolder;
  private onFlagClick: (filePath: string, lineNumber: number) => void;
  private hiddenFlags: Set<string>;
  private fontSize: number;
  private lineHeight: number;

  constructor(options: SummaryRendererOptions) {
    super();
    this.app = options.app;
    this.containerEl = options.containerEl;
    this.flagsByFolder = options.flagsByFolder;
    this.onFlagClick = options.onFlagClick;
    this.hiddenFlags = options.hiddenFlags;
    this.fontSize = options.fontSize;
    this.lineHeight = options.lineHeight;
  }

  private getContrastingTextColor(hex: string): string {
    try {
      const color = chroma(hex);
      const contrastWhite = chroma.contrast(color, "#ffffff");
      const contrastBlack = chroma.contrast(color, "#1a1a1a");
      return contrastWhite >= contrastBlack ? "#ffffff" : "#1a1a1a";
    } catch (error) {
      return "#1a1a1a";
    }
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.addClass("long-view-summary");

    // Apply font settings as CSS variables
    this.containerEl.style.setProperty("--long-view-summary-font-size", `${this.fontSize}px`);
    this.containerEl.style.setProperty("--long-view-summary-line-height", `${this.lineHeight}`);

    // Sort folders alphabetically
    const sortedFolders = Object.keys(this.flagsByFolder).sort();

    if (sortedFolders.length === 0) {
      this.containerEl.createDiv({
        cls: "long-view-summary-empty",
        text: "No flags found in vault",
      });
      return;
    }

    for (const folderPath of sortedFolders) {
      const folderData = this.flagsByFolder[folderPath];

      // Folder wrapper with border
      const folderWrapperEl = this.containerEl.createDiv({ cls: "long-view-summary-folder-wrapper" });
      const folderEl = folderWrapperEl.createDiv({ cls: "long-view-summary-folder" });

      // Folder header (skip "Root" label for root folder)
      if (folderPath !== "/") {
        const folderHeader = folderEl.createDiv({
          cls: "long-view-summary-folder-name",
          text: folderPath + "/",
        });
      }

      // Sort files alphabetically
      const sortedFiles = Object.keys(folderData).sort();

      for (const filePath of sortedFiles) {
        const fileData = folderData[filePath];

        // File wrapper with border
        const fileWrapperEl = folderEl.createDiv({ cls: "long-view-summary-file-wrapper" });
        const fileEl = fileWrapperEl.createDiv({ cls: "long-view-summary-file" });

        // File name (indented)
        const fileName = fileData.file.basename + ".md";
        const fileHeader = fileEl.createDiv({
          cls: "long-view-summary-file-name",
          text: fileName,
        });

        // Sort flag types alphabetically and filter out hidden ones
        const sortedFlagTypes = Object.keys(fileData.flagsByType)
          .filter((flagType) => !this.hiddenFlags.has(flagType.toUpperCase()))
          .sort();

        for (const flagType of sortedFlagTypes) {
          const instances = fileData.flagsByType[flagType];
          if (instances.length === 0) continue;

          const flagTypeEl = fileEl.createDiv({ cls: "long-view-summary-flag-type" });

          // Flag type header with background color and contrasting text
          const flagColor = getFlagColor(flagType);
          const textColor = this.getContrastingTextColor(flagColor);
          const flagTypeHeader = flagTypeEl.createDiv({
            cls: "long-view-summary-flag-type-name",
            text: flagType,
          });
          flagTypeHeader.style.backgroundColor = flagColor;
          flagTypeHeader.style.color = textColor;

          // Flag instances
          const flagListEl = flagTypeEl.createDiv({ cls: "long-view-summary-flag-list" });

          for (const instance of instances) {
            const flagItemEl = flagListEl.createDiv({ cls: "long-view-summary-flag-item" });

            const flagLink = flagItemEl.createEl("a", {
              cls: "long-view-summary-flag-link",
              text: `- ${instance.flag.message}`,
              href: "#",
            });

            flagLink.addEventListener("click", (e) => {
              e.preventDefault();
              this.onFlagClick(instance.file.path, instance.lineNumber);
            });
          }
        }
      }
    }
  }
}
