import { ItemView, MarkdownRenderer, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { parseDocumentIntoPages, DocumentPage } from '../utils/documentParser';
import { calculateWordsPerPage } from '../settings';
import type LongViewPlugin from '../main';

export const LONG_VIEW_TYPE = 'long-view';

export class LongView extends ItemView {
	plugin: LongViewPlugin;
	private pages: DocumentPage[] = [];
	private currentZoom: number = 15;
	private contentContainerEl: HTMLElement;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LongViewPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return LONG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Long View';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl;
		container.empty();
		container.addClass('long-view-container');

		// Create main content area
		this.contentContainerEl = container.createDiv({ cls: 'long-view-content' });

		// Create settings button at the bottom
		const controlsContainer = container.createDiv({ cls: 'long-view-controls' });

		const settingsButton = controlsContainer.createEl('button', {
			cls: 'long-view-settings-button',
			attr: {
				'aria-label': 'Long View Settings'
			}
		});
		settingsButton.innerHTML = '⚙️';

		settingsButton.addEventListener('click', () => {
			this.showSettingsMenu(settingsButton);
		});

		// Initialize zoom from settings
		this.currentZoom = this.plugin.settings.defaultZoom;

		// Initial render
		await this.updateView();

		// Register event to update when active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateView();
			})
		);

		// Register event to update when file is modified
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				this.updateView();
			})
		);
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	private async updateView(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			this.contentContainerEl.empty();
			this.contentContainerEl.createDiv({
				text: 'No active document',
				cls: 'long-view-empty'
			});
			this.currentFile = null;
			return;
		}

		this.currentFile = activeFile;
		const content = await this.app.vault.read(activeFile);

		// Calculate words per page based on current settings
		const wordsPerPage = calculateWordsPerPage(
			this.plugin.settings.fontSize,
			this.plugin.settings.paddingVertical,
			this.plugin.settings.paddingHorizontal
		);

		this.pages = parseDocumentIntoPages(content, wordsPerPage);

		await this.renderPages(activeFile);
	}

	private async renderPages(file: TFile): Promise<void> {
		this.contentContainerEl.empty();

		if (this.pages.length === 0) {
			this.contentContainerEl.createDiv({
				text: 'Document is empty',
				cls: 'long-view-empty'
			});
			return;
		}

		const grid = this.contentContainerEl.createDiv({ cls: 'long-view-grid' });

		for (const page of this.pages) {
			const pageEl = grid.createDiv({ cls: 'long-view-page' });
			pageEl.setAttribute('data-page', String(page.pageNumber));

			// Content container
			const contentEl = pageEl.createDiv({ cls: 'long-view-page-content' });

			// Render markdown content using Obsidian's markdown renderer
			try {
				await MarkdownRenderer.render(
					this.app,
					page.content,
					contentEl,
					file.path,
					this
				);
				console.log(`Long View: Rendered page ${page.pageNumber + 1}`);
			} catch (error) {
				console.error('Long View: Error rendering markdown:', error);
				// Fallback to plain text if rendering fails
				contentEl.setText(page.content);
			}

			// Make page clickable to scroll to location in editor
			pageEl.addEventListener('click', () => {
				this.scrollToPage(page);
			});
		}

		this.updateZoom();
	}

	private showSettingsMenu(buttonEl: HTMLElement): void {
		const menu = document.createElement('div');
		menu.addClass('long-view-settings-menu');

		// Zoom control
		const zoomContainer = menu.createDiv({ cls: 'long-view-setting-item' });
		const zoomLabel = zoomContainer.createSpan({
			cls: 'long-view-setting-label',
			text: `Zoom: ${this.currentZoom}%`
		});
		const zoomSlider = zoomContainer.createEl('input', {
			type: 'range',
			cls: 'long-view-setting-slider',
			attr: {
				min: '5',
				max: '30',
				value: String(this.currentZoom),
			},
		});
		zoomSlider.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			this.currentZoom = parseInt(target.value);
			zoomLabel.setText(`Zoom: ${this.currentZoom}%`);
			this.plugin.settings.defaultZoom = this.currentZoom;
			this.plugin.saveSettings();
			this.updateZoom();
		});

		// Font size control
		const fontSizeContainer = menu.createDiv({ cls: 'long-view-setting-item' });
		fontSizeContainer.createSpan({
			cls: 'long-view-setting-label',
			text: 'Font Size (px)'
		});
		const fontSizeInput = fontSizeContainer.createEl('input', {
			type: 'number',
			cls: 'long-view-setting-number',
			attr: {
				min: '12',
				max: '48',
				value: String(this.plugin.settings.fontSize),
			},
		});
		fontSizeInput.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			const value = Math.max(12, Math.min(48, parseInt(target.value) || 25));
			this.plugin.settings.fontSize = value;
			target.value = String(value);
			this.plugin.saveSettings();
			this.applyStyleSettings();
			this.updateView();
		});

		// Padding control
		const paddingContainer = menu.createDiv({ cls: 'long-view-setting-item' });
		paddingContainer.createSpan({
			cls: 'long-view-setting-label',
			text: 'Padding (px)'
		});
		const paddingInput = paddingContainer.createEl('input', {
			type: 'number',
			cls: 'long-view-setting-number',
			attr: {
				min: '50',
				max: '400',
				step: '10',
				value: String(this.plugin.settings.paddingVertical),
			},
		});
		paddingInput.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			const value = Math.max(50, Math.min(400, parseInt(target.value) || 250));
			this.plugin.settings.paddingVertical = value;
			this.plugin.settings.paddingHorizontal = Math.floor(value * 0.8); // Keep 5:4 ratio
			target.value = String(value);
			this.plugin.saveSettings();
			this.applyStyleSettings();
			this.updateView();
		});

		// Position menu above button
		const rect = buttonEl.getBoundingClientRect();
		menu.style.position = 'fixed';
		menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
		menu.style.left = `${rect.left}px`;

		document.body.appendChild(menu);

		// Close menu when clicking outside
		const closeMenu = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node) && e.target !== buttonEl) {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			}
		};

		// Delay adding the listener so this click doesn't immediately close it
		setTimeout(() => {
			document.addEventListener('click', closeMenu);
		}, 0);
	}

	private applyStyleSettings(): void {
		const grid = this.contentContainerEl.querySelector('.long-view-grid') as HTMLElement;
		if (!grid) return;

		const pages = grid.querySelectorAll('.long-view-page-content') as NodeListOf<HTMLElement>;
		pages.forEach((page) => {
			page.style.fontSize = `${this.plugin.settings.fontSize}px`;
			page.style.padding = `${this.plugin.settings.paddingVertical}px ${this.plugin.settings.paddingHorizontal}px`;
		});
	}

	private updateZoom(): void {
		const grid = this.contentContainerEl.querySelector('.long-view-grid') as HTMLElement;
		if (!grid) return;

		// Apply transform scale to the entire grid (camera zoom effect)
		const scale = this.currentZoom / 100;
		grid.style.transform = `scale(${scale})`;
		grid.style.transformOrigin = 'top left';

		// Calculate how many columns can fit based on zoom level
		// At 30% zoom, pages are effectively 382.5px wide
		// At 5% zoom, pages are effectively 63.75px wide
		const pageWidth = 1275;
		const gap = 100;
		const containerWidth = this.contentContainerEl.clientWidth - 40; // minus padding

		// Calculate effective page width after scaling
		const effectivePageWidth = pageWidth * scale;
		const effectiveGap = gap * scale;

		// Calculate how many columns fit
		const columnsToFit = Math.max(1, Math.floor((containerWidth + effectiveGap) / (effectivePageWidth + effectiveGap)));

		// Update grid to show that many columns
		grid.style.gridTemplateColumns = `repeat(${columnsToFit}, ${pageWidth}px)`;

		console.log(`Long View: Zoom ${this.currentZoom}%, fitting ${columnsToFit} columns (effective width: ${effectivePageWidth}px)`);
	}

	private scrollToPage(page: DocumentPage): void {
		if (!this.currentFile) {
			console.log('Long View: No current file');
			return;
		}

		// Find a markdown view with the same file
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		let targetLeaf = null;

		for (const leaf of leaves) {
			const view = leaf.view as MarkdownView;
			if (view.file && view.file.path === this.currentFile.path) {
				targetLeaf = leaf;
				break;
			}
		}

		if (!targetLeaf) {
			console.log('Long View: No markdown view found for file:', this.currentFile.path);
			return;
		}

		const view = targetLeaf.view as MarkdownView;
		const editor = view.editor;
		if (!editor) {
			console.log('Long View: No editor found in markdown view');
			return;
		}

		// Calculate line number from character offset
		const content = editor.getValue();
		const textBeforePage = content.substring(0, page.startOffset);
		const lineNumber = textBeforePage.split('\n').length - 1;

		console.log(`Long View: Scrolling to page ${page.pageNumber + 1}, line ${lineNumber}`);

		// Scroll to the line
		editor.setCursor({ line: lineNumber, ch: 0 });
		editor.scrollIntoView(
			{ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } },
			true
		);

		// Reveal and focus the markdown view
		this.app.workspace.revealLeaf(targetLeaf);
	}
}
