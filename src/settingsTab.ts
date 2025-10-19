import { App, PluginSettingTab, Setting } from 'obsidian';
import type LongViewPlugin from './main';
import { FLAG_METADATA, FlagMetadata } from './flags/flagData';
import { DEFAULT_FLAG_COLORS } from './settings';
import { setFlagColorMap } from './flags/flagColors';

export class LongViewSettingTab extends PluginSettingTab {
	private readonly plugin: LongViewPlugin;

	constructor(app: App, plugin: LongViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

		display(): void {
			const { containerEl } = this;
			containerEl.empty();

			containerEl.createEl('h2', { text: 'Long View Settings' });

			this.renderFlagColorSection(containerEl);
			this.renderMinimapTextSection(containerEl);
		}

	private renderFlagColorSection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: 'long-view-settings-section' });
		section.createEl('h3', { text: 'Flag Colors' });
		section.createEl('p', {
			text: 'Adjust the highlight color for each flag. Changes apply immediately across the minimap, paged view, and editor.',
		});

		FLAG_METADATA.forEach((meta) => {
			if (meta.type === 'COMMENT' || meta.type === 'MISSING') {
				return; // Show special cases after standard flags
			}
			this.addFlagColorSetting(section, meta);
		});
		// Include missing and comment at the end for clarity
		FLAG_METADATA.filter((meta) => meta.type === 'COMMENT' || meta.type === 'MISSING').forEach((meta) => {
			this.addFlagColorSetting(section, meta);
		});

		new Setting(section)
			.setName('Reset colors')
			.setDesc('Restore the default palette for all flags.')
			.addButton((btn) => {
				btn.setButtonText('Reset')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.flagColors = { ...DEFAULT_FLAG_COLORS };
						setFlagColorMap(this.plugin.settings.flagColors);
						await this.plugin.saveSettings();
						this.plugin.applyFlagStyles();
						await this.plugin.refreshOpenViews();
						this.display();
					});
			});
	}

	private addFlagColorSetting(parent: HTMLElement, meta: FlagMetadata): void {
		const typeKey = meta.type;
		const setting = new Setting(parent)
			.setName(meta.label)
			.setDesc(meta.description);

		const preview = setting.controlEl.createSpan({ cls: 'long-view-inline-flag-preview' });
		preview.addClass('long-view-inline-flag', `long-view-inline-flag-${typeKey.toLowerCase()}`);
		preview.dataset.flagType = typeKey.toLowerCase();
		if (typeKey === 'MISSING') {
			preview.addClass('is-missing-flag');
		}
		preview.setText(meta.example);

		setting.addColorPicker((picker) => {
			picker.setValue(this.plugin.settings.flagColors[typeKey]);
			picker.onChange(async (value) => {
				this.plugin.settings.flagColors[typeKey] = value;
				setFlagColorMap(this.plugin.settings.flagColors);
				await this.plugin.saveSettings();
				this.plugin.applyFlagStyles();
				await this.plugin.refreshOpenViews();
			});
		});
	}

	private renderMinimapTextSection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: 'long-view-settings-section' });
		section.createEl('h3', { text: 'Minimap Text Size' });
		section.createEl('p', {
			text: 'Control how large headings, paragraph text, and flag labels appear in the minimap overview.',
		});

		this.addMinimapInput(section, 'Paragraph text size', 'body', 1, 8, 0.5, 'px');
		this.addMinimapInput(section, 'Heading text size', 'heading', 8, 20, 1, 'px');
		this.addMinimapInput(section, 'Flag label size', 'flag', 8, 18, 1, 'px');
	}

	private addMinimapInput(
		parent: HTMLElement,
		label: string,
		key: keyof LongViewPlugin['settings']['minimapFontSizes'],
		min: number,
		max: number,
		step: number,
		unit: string,
	): void {
		const setting = new Setting(parent).setName(label).setDesc(`Allowed range: ${min}-${max}${unit}`);

		setting.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.step = String(step);
			text.inputEl.min = String(min);
			text.inputEl.max = String(max);
			text.setValue(this.plugin.settings.minimapFontSizes[key].toString());
			text.onChange(async (value) => {
				const numericValue = parseFloat(value);
				if (Number.isNaN(numericValue) || numericValue < min || numericValue > max) {
					text.inputEl.classList.add('long-view-input-invalid');
					return;
				}
				text.inputEl.classList.remove('long-view-input-invalid');
				this.plugin.settings.minimapFontSizes[key] = numericValue;
				await this.plugin.saveSettings();
				await this.plugin.refreshOpenViews();
			});
		});
	}
}
