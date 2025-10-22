import { App, PluginSettingTab, Setting } from "obsidian";
import type LongViewPlugin from "./main";
import { DEFAULT_FLAG_COLORS } from "./settings";
import { setFlagColorMap } from "./flags/flagColors";

export class LongViewSettingTab extends PluginSettingTab {
  private readonly plugin: LongViewPlugin;

  constructor(app: App, plugin: LongViewPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Long View Settings" });

    this.renderFlagColorSection(containerEl);
    this.renderMinimapTextSection(containerEl);
  }

  private renderFlagColorSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: "long-view-settings-section" });
    section.createEl("h3", { text: "Flags" });
    section.createEl("p", {
      text: "Customize your flags. TODO, MISSING, and comments are fixed. Add, rename, and color your own flags below.",
    });

    // Fixed flags: TODO and MISSING
    this.addFixedFlagSetting(
      section,
      "TODO",
      "Todo",
      "Highlights tasks to complete",
      "==TODO: Draft outline ==",
    );
    this.addFixedFlagSetting(
      section,
      "MISSING",
      "Missing",
      "Calls out missing content; shows entire line",
      "==MISSING: Add summary ==",
    );

    // Comment color and toggle
    const commentContainer = section.createDiv({
      cls: "long-view-comment-settings",
    });
    this.addFixedFlagSetting(
      commentContainer,
      "COMMENT",
      "Comment",
      "General inline comments",
      "%% comment %%",
    );
    this.addCommentToggle(commentContainer);

    // Custom flags list
    section.createEl("h4", { text: "Custom Flags" });
    const listContainer = section.createDiv({ cls: "long-view-custom-flags" });
    this.renderCustomFlags(listContainer);

    new Setting(section)
      .setName("Reset to defaults")
      .setDesc(
        "Restore default fixed flag colors and default custom flags (REWRITE, RESEARCH).",
      )
      .addButton((btn) => {
        btn
          .setButtonText("Reset")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.flagColors = { ...DEFAULT_FLAG_COLORS };
            this.plugin.settings.customFlags = [
              { name: "REWRITE", color: DEFAULT_FLAG_COLORS.REWRITE },
              { name: "RESEARCH", color: DEFAULT_FLAG_COLORS.RESEARCH },
            ];
            setFlagColorMap(this.plugin.settings.flagColors);
            await this.plugin.saveSettings();
            this.plugin.applyFlagStyles();
            await this.plugin.refreshOpenViews();
            this.display();
          });
      });
  }

  private addFixedFlagSetting(
    parent: HTMLElement,
    key: string,
    label: string,
    description: string,
    example: string,
  ): void {
    const setting = new Setting(parent).setName(label).setDesc(description);

    const preview = setting.controlEl.createSpan({
      cls: "long-view-inline-flag-preview",
    });
    preview.addClass(
      "long-view-inline-flag",
      `long-view-inline-flag-${key.toLowerCase()}`,
    );
    preview.dataset.flagType = key.toLowerCase();
    if (key === "MISSING") preview.addClass("is-missing-flag");
    preview.setText(example);

    setting.addColorPicker((picker) => {
      const current = this.plugin.settings.flagColors[key] || "#888888";
      picker.setValue(current);
      picker.onChange(async (value) => {
        this.plugin.settings.flagColors[key] = value;
        setFlagColorMap(this.plugin.settings.flagColors);
        await this.plugin.saveSettings();
        this.plugin.applyFlagStyles();
        await this.plugin.refreshOpenViews();
      });
    });
  }

  private addCommentToggle(container: HTMLElement): void {
    const setting = new Setting(container)
      .setName("Include comments in minimap")
      .setDesc(
        "Toggle to show or hide %% inline comments %% inside the minimap overview.",
      );

    setting.addToggle((toggle) => {
      toggle
        .setValue(this.plugin.settings.includeCommentsInMinimap)
        .onChange(async (value) => {
          this.plugin.settings.includeCommentsInMinimap = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshOpenViews();
        });
    });
  }

  private renderCustomFlags(parent: HTMLElement): void {
    parent.empty();
    const makeRow = (index: number, name: string, color: string) => {
      const row = new Setting(parent);
      row.setName("");
      row.setDesc("");
      // Name input
      row.addText((text) => {
        text.setPlaceholder("FLAG NAME (e.g., REWRITE)");
        text.setValue(name);
        text.onChange(async (val) => {
          const newName = (val || "").trim();
          const upperOld = name.toUpperCase();
          const upperNew = newName.toUpperCase();
          // Update list
          this.plugin.settings.customFlags[index].name = upperNew;
          // Move color mapping
          const colorVal = this.plugin.settings.flagColors[upperOld];
          if (upperOld && upperOld !== upperNew && colorVal) {
            delete this.plugin.settings.flagColors[upperOld];
            this.plugin.settings.flagColors[upperNew] = colorVal;
          }
          await this.persistAndRefresh();
        });
      });
      // Color input
      row.addColorPicker((picker) => {
        picker.setValue(color);
        picker.onChange(async (val) => {
          const upper = (
            this.plugin.settings.customFlags[index].name || name
          ).toUpperCase();
          this.plugin.settings.customFlags[index].color = val;
          this.plugin.settings.flagColors[upper] = val;
          await this.persistAndRefresh();
        });
      });
      // Remove button
      row.addExtraButton((btn) => {
        btn
          .setIcon("trash")
          .setTooltip("Remove flag")
          .onClick(async () => {
            const upper = (
              this.plugin.settings.customFlags[index].name || name
            ).toUpperCase();
            this.plugin.settings.customFlags.splice(index, 1);
            delete this.plugin.settings.flagColors[upper];
            await this.persistAndRefresh();
            this.renderCustomFlags(parent);
          });
      });
    };

    // Render existing custom flags
    this.plugin.settings.customFlags.forEach((cf, idx) => {
      const name = (cf.name || "").toUpperCase();
      const color =
        this.plugin.settings.flagColors[name] || cf.color || "#66aaff";
      // Ensure mapping exists
      this.plugin.settings.flagColors[name] = color;
      makeRow(idx, name, color);
    });

    // Add button
    new Setting(parent)
      .setName("Add custom flag")
      .setDesc("Create a new flag name and choose a color")
      .addButton((btn) => {
        btn.setButtonText("Add Flag").onClick(async () => {
          const newName = "NEWFLAG";
          const color = "#66aaff";
          this.plugin.settings.customFlags.push({ name: newName, color });
          this.plugin.settings.flagColors[newName] = color;
          await this.persistAndRefresh();
          this.renderCustomFlags(parent);
        });
      });
  }

  private async persistAndRefresh(): Promise<void> {
    setFlagColorMap(this.plugin.settings.flagColors);
    await this.plugin.saveSettings();
    this.plugin.applyFlagStyles();
    await this.plugin.refreshOpenViews();
  }

  private renderMinimapTextSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: "long-view-settings-section" });
    section.createEl("h3", { text: "Minimap Text Size" });
    section.createEl("p", {
      text: "Control how large headings, paragraph text, and flag labels appear in the minimap overview.",
    });

    this.addMinimapInput(
      section,
      "Paragraph text size",
      "body",
      1,
      8,
      0.5,
      "px",
    );
    this.addMinimapInput(
      section,
      "Heading text size",
      "heading",
      8,
      20,
      1,
      "px",
    );
    this.addMinimapInput(section, "Flag label size", "flag", 8, 18, 1, "px");
    this.addLineGapInput(section);
  }

  private addMinimapInput(
    parent: HTMLElement,
    label: string,
    key: keyof LongViewPlugin["settings"]["minimapFontSizes"],
    min: number,
    max: number,
    step: number,
    unit: string,
  ): void {
    const setting = new Setting(parent)
      .setName(label)
      .setDesc(`Allowed range: ${min}-${max}${unit}`);

    setting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.step = String(step);
      text.inputEl.min = String(min);
      text.inputEl.max = String(max);
      text.setValue(this.plugin.settings.minimapFontSizes[key].toString());
      text.onChange(async (value) => {
        const numericValue = parseFloat(value);
        if (
          Number.isNaN(numericValue) ||
          numericValue < min ||
          numericValue > max
        ) {
          text.inputEl.classList.add("long-view-input-invalid");
          return;
        }
        text.inputEl.classList.remove("long-view-input-invalid");
        this.plugin.settings.minimapFontSizes[key] = numericValue;
        await this.plugin.saveSettings();
        await this.plugin.refreshOpenViews();
      });
    });
  }

  private addLineGapInput(parent: HTMLElement): void {
    const setting = new Setting(parent)
      .setName("Minimap line height")
      .setDesc("Distance between rows in the minimap (px).");
    setting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = "0.5";
      text.setValue(this.plugin.settings.minimapLineGap.toString());
      text.onChange(async (value) => {
        const numericValue = parseFloat(value);
        if (Number.isNaN(numericValue) || numericValue < 0) {
          text.inputEl.classList.add("long-view-input-invalid");
          return;
        }
        text.inputEl.classList.remove("long-view-input-invalid");
        this.plugin.settings.minimapLineGap = numericValue;
        await this.plugin.saveSettings();
        await this.plugin.refreshOpenViews();
      });
    });
  }
}
