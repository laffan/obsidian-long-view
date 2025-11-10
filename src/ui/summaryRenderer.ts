import { App, Component } from "obsidian";
import { FlagsByFolder, FlagInstance } from "../utils/vaultScanner";
import { getFlagColor } from "../flags/flagColors";
import chroma from "../utils/chroma";

export interface SummaryRendererOptions {
  app: App;
  containerEl: HTMLElement;
  flagsByFolder: FlagsByFolder;
  onFlagClick: (filePath: string, lineNumber: number) => void;
  onFolderToggle: (folderPath: string, enabled: boolean) => void;
  hiddenFlags: Set<string>;
  disabledFolders: Set<string>;
  fontSize: number;
  lineHeight: number;
}

export class SummaryRenderer extends Component {
  private app: App;
  private containerEl: HTMLElement;
  private flagsByFolder: FlagsByFolder;
  private onFlagClick: (filePath: string, lineNumber: number) => void;
  private onFolderToggle: (folderPath: string, enabled: boolean) => void;
  private hiddenFlags: Set<string>;
  private disabledFolders: Set<string>;
  private fontSize: number;
  private lineHeight: number;

  constructor(options: SummaryRendererOptions) {
    super();
    this.app = options.app;
    this.containerEl = options.containerEl;
    this.flagsByFolder = options.flagsByFolder;
    this.onFlagClick = options.onFlagClick;
    this.onFolderToggle = options.onFolderToggle;
    this.hiddenFlags = options.hiddenFlags;
    this.disabledFolders = options.disabledFolders;
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
      const isFolderDisabled = this.disabledFolders.has(folderPath);

      // First, determine which files have visible flags
      const sortedFiles = Object.keys(folderData).sort();
      const visibleFiles: string[] = [];

      for (const filePath of sortedFiles) {
        const fileData = folderData[filePath];
        const sortedFlagTypes = Object.keys(fileData.flagsByType)
          .filter((flagType) => !this.hiddenFlags.has(flagType.toUpperCase()))
          .sort();

        // Only include files that have at least one visible flag type
        if (sortedFlagTypes.length > 0) {
          visibleFiles.push(filePath);
        }
      }

      // Always show folders, even if they have no visible flags

      // Folder wrapper with border
      const folderWrapperEl = this.containerEl.createDiv({ cls: "long-view-summary-folder-wrapper" });
      const folderEl = folderWrapperEl.createDiv({ cls: "long-view-summary-folder" });

      // Folder header with checkbox (skip "Root" label for root folder)
      const folderHeaderContainer = folderEl.createDiv({ cls: "long-view-summary-folder-header" });

      if (folderPath !== "/") {
        const folderNameEl = folderHeaderContainer.createDiv({
          cls: "long-view-summary-folder-name",
          text: folderPath + "/",
        });
      } else {
        // For root folder, show "Root" label
        const folderNameEl = folderHeaderContainer.createDiv({
          cls: "long-view-summary-folder-name",
          text: "Root",
        });
      }

      // Add checkbox to the right
      const checkboxEl = folderHeaderContainer.createEl("input", {
        type: "checkbox",
        cls: "long-view-summary-folder-checkbox",
      });
      checkboxEl.checked = !isFolderDisabled;
      checkboxEl.addEventListener("change", () => {
        this.onFolderToggle(folderPath, checkboxEl.checked);
      });

      // Only render files if folder is not disabled
      if (!isFolderDisabled) {
        for (const filePath of visibleFiles) {
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
      } // end if (!isFolderDisabled)
    }
  }
}
