import { Plugin, WorkspaceLeaf } from 'obsidian';
import { LongView, LONG_VIEW_TYPE } from './ui/LongView';
import { LongViewSettings, DEFAULT_SETTINGS, DEFAULT_FLAG_COLORS } from './settings';
import { createFlagHighlightExtension, processRenderedFlags } from './flags/flagStyling';
import { setFlagColorMap } from './flags/flagColors';
import { FLAG_TYPES } from './flags/flagData';
import { LongViewSettingTab } from './settingsTab';

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
		this.registerView(
			LONG_VIEW_TYPE,
			(leaf) => new LongView(leaf, this)
		);

		// Add ribbon icon to open the view
		this.addRibbonIcon('layout-grid', 'Open Long View', () => {
			this.activateView();
		});

		// Add command to open the view
		this.addCommand({
			id: 'open-long-view',
			name: 'Open Long View',
			callback: () => {
				this.activateView();
			}
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
		this.settings.flagColors = Object.assign({}, DEFAULT_FLAG_COLORS, persisted?.flagColors ?? {});
		this.settings.minimapFontSizes = Object.assign({}, DEFAULT_SETTINGS.minimapFontSizes, persisted?.minimapFontSizes ?? {});
		this.settings.minimapLineGap = typeof persisted?.minimapLineGap === 'number' ? persisted.minimapLineGap : DEFAULT_SETTINGS.minimapLineGap;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public applyFlagStyles(): void {
		const css = this.generateFlagStyles();
		if (!this.flagStyleEl) {
			this.flagStyleEl = document.createElement('style');
			this.flagStyleEl.id = 'long-view-flag-styles';
			this.flagStyleEl.setAttribute('data-long-view', 'flag-styles');
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
			})
		);
	}

	private generateFlagStyles(): string {
		const colorMap = this.settings.flagColors;
		let css = '';
		for (const type of FLAG_TYPES) {
			const color = colorMap[type];
			const typeLower = type.toLowerCase();
			const textColor = getContrastingTextColor(color);
			if (type === 'MISSING') {
				const borderColor = color;
				const bg = toRgba(color, 0.12);
				const inlineBg = toRgba(color, 0.18);
				css += `
.long-view-minimap-flag.is-missing-flag { border-color: ${borderColor}; color: ${borderColor}; }
.long-view-flag-bar.is-missing-flag { border-color: ${borderColor}; background-color: ${bg}; color: ${textColor}; }
.markdown-preview-view mark.long-view-inline-flag.is-missing-flag,
.cm-content .long-view-inline-flag.is-missing-flag { border-color: ${borderColor}; background-color: ${inlineBg} !important; color: ${textColor} !important; }
`;
				continue;
			}

			const minimapBg = color;
			const pagedBg = color;
			const inlineBg = color;
			const minimapText = 'var(--text-normal)';
				const pagedText = type === 'COMMENT' ? 'var(--text-normal)' : textColor;
				const inlineText = type === 'COMMENT' ? 'var(--text-normal)' : textColor;
			css += `
.long-view-minimap-flag.long-view-flag-type-${typeLower} { background-color: ${minimapBg}; color: ${minimapText}; }
.long-view-page-content .long-view-flag-bar.long-view-flag-type-${typeLower} { background-color: ${pagedBg}; color: ${pagedText}; }
.markdown-preview-view mark.long-view-inline-flag.long-view-inline-flag-${typeLower},
.cm-content .long-view-inline-flag.long-view-inline-flag-${typeLower} { background-color: ${inlineBg} !important; color: ${inlineText} !important; }
`;
			}
		return css;
	}
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const sanitized = hex.trim().replace('#', '');
	if (sanitized.length !== 6) {
		return null;
	}
	const r = parseInt(sanitized.substring(0, 2), 16);
	const g = parseInt(sanitized.substring(2, 4), 16);
	const b = parseInt(sanitized.substring(4, 6), 16);
	if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
		return null;
	}
	return { r, g, b };
}

function toRgba(hex: string, alpha: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) {
		return hex;
	}
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getContrastingTextColor(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) {
		return '#1a1a1a';
	}
	const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
	return luminance > 0.65 ? '#1a1a1a' : '#f5f5f5';
}
