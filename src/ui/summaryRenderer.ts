import { App, Component } from "obsidian";
import { FlagsByFolder, FlagInstance } from "../utils/vaultScanner";
import { getFlagColor } from "../flags/flagColors";

export interface SummaryRendererOptions {
  app: App;
  containerEl: HTMLElement;
  flagsByFolder: FlagsByFolder;
  onFlagClick: (filePath: string, lineNumber: number) => void;
  hiddenFlags: Set<string>;
}

export class SummaryRenderer extends Component {
  private app: App;
  private containerEl: HTMLElement;
  private flagsByFolder: FlagsByFolder;
  private onFlagClick: (filePath: string, lineNumber: number) => void;
  private hiddenFlags: Set<string>;

  constructor(options: SummaryRendererOptions) {
    super();
    this.app = options.app;
    this.containerEl = options.containerEl;
    this.flagsByFolder = options.flagsByFolder;
    this.onFlagClick = options.onFlagClick;
    this.hiddenFlags = options.hiddenFlags;
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.addClass("long-view-summary");

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
      const folderEl = this.containerEl.createDiv({ cls: "long-view-summary-folder" });

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
        const fileEl = folderEl.createDiv({ cls: "long-view-summary-file" });

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

          // Flag type header with color
          const flagColor = getFlagColor(flagType);
          const flagTypeHeader = flagTypeEl.createDiv({
            cls: "long-view-summary-flag-type-name",
            text: flagType,
          });
          flagTypeHeader.style.color = flagColor;

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
