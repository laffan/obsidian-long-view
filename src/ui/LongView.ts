import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { DocumentPage, getFirstWords } from '../utils/documentParser';
import { paginateDocument } from '../utils/simplePagination';
import { MiniMapRenderer } from './miniMapRenderer';
import { renderPageContent } from './simplePageRenderer';
import { ViewMode } from '../settings';
import type LongViewPlugin from '../main';

export const LONG_VIEW_TYPE = 'long-view';

export class LongView extends ItemView {
	plugin: LongViewPlugin;
	private pages: DocumentPage[] = [];
	private contentContainerEl: HTMLElement;
	private currentFile: TFile | null = null;
	private minimapRenderer: MiniMapRenderer | null = null;
	private editorScrollEl: HTMLElement | null = null;
	private activeLeaf: WorkspaceLeaf | null = null;
	private documentLength = 0;
	private readonly onEditorScroll = () => this.updateActiveHeading();
	private currentMode: ViewMode = 'minimap';
	private currentZoom: number = 15;
	private modeButtonsEl: HTMLElement | null = null;
	private zoomControlEl: HTMLElement | null = null;

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

		// Create header with mode buttons and zoom control
		const headerEl = container.createDiv({ cls: 'long-view-header' });

		// Mode switcher buttons
		this.modeButtonsEl = headerEl.createDiv({ cls: 'long-view-mode-buttons' });

		const minimapBtn = this.modeButtonsEl.createEl('button', {
			text: 'Minimap',
			cls: 'long-view-mode-button',
		});
		const pagedBtn = this.modeButtonsEl.createEl('button', {
			text: 'Paged',
			cls: 'long-view-mode-button',
		});

		// Refresh button
		const refreshBtn = this.modeButtonsEl.createEl('button', {
			text: '♻️',
			cls: 'long-view-refresh-button',
			attr: {
				'aria-label': 'Refresh view'
			}
		});

		// Zoom control (only visible in paged mode)
		this.zoomControlEl = headerEl.createDiv({ cls: 'long-view-zoom-control' });
		const zoomLabel = this.zoomControlEl.createSpan({
			cls: 'long-view-zoom-label',
			text: `Zoom: ${this.currentZoom}%`,
		});
		const zoomSlider = this.zoomControlEl.createEl('input', {
			type: 'range',
			cls: 'long-view-zoom-slider',
			attr: {
				min: '5',
				max: '30',
				value: String(this.currentZoom),
			},
		});

		// Initialize mode from settings
		this.currentMode = this.plugin.settings.viewMode;
		this.currentZoom = this.plugin.settings.defaultZoom;

		// Update UI state
		const updateModeUI = () => {
			minimapBtn.toggleClass('is-active', this.currentMode === 'minimap');
			pagedBtn.toggleClass('is-active', this.currentMode === 'paged');
			this.zoomControlEl?.toggleClass('is-visible', this.currentMode === 'paged');
		};
		updateModeUI();

		// Mode button handlers
		minimapBtn.addEventListener('click', () => {
			this.currentMode = 'minimap';
			this.plugin.settings.viewMode = 'minimap';
			this.plugin.saveSettings();
			updateModeUI();
			this.updateView();
		});

		pagedBtn.addEventListener('click', () => {
			this.currentMode = 'paged';
			this.plugin.settings.viewMode = 'paged';
			this.plugin.saveSettings();
			updateModeUI();
			this.updateView();
		});

		// Zoom slider handler
		zoomSlider.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			this.currentZoom = parseInt(target.value);
			zoomLabel.setText(`Zoom: ${this.currentZoom}%`);
			this.plugin.settings.defaultZoom = this.currentZoom;
			this.plugin.saveSettings();
			this.updateZoom();
		});

		// Refresh button handler
		refreshBtn.addEventListener('click', () => {
			this.updateView();
		});

		// Create main content area
		this.contentContainerEl = container.createDiv({ cls: 'long-view-content' });

		// Initial render
		await this.updateView();

		// Register event to update when active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateView();
			})
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

	private async updateView(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			this.contentContainerEl.empty();
			this.contentContainerEl.createDiv({
				text: 'No active document',
				cls: 'long-view-empty'
			});
			this.currentFile = null;
			this.documentLength = 0;
			return;
		}

		this.currentFile = activeFile;
		const content = await this.app.vault.read(activeFile);
		this.documentLength = content.length;

		// Simple, fast pagination
		console.log('Long View: Parsing document...');
		const startTime = Date.now();
		this.pages = paginateDocument(content);
		const duration = Date.now() - startTime;
		console.log(`Long View: Created ${this.pages.length} sections in ${duration}ms`);

		// Render based on current mode
		if (this.currentMode === 'paged') {
			await this.renderPaged(activeFile);
		} else {
			await this.renderMinimap(activeFile);
			this.bindToActiveEditor();
		}
	}

	private async renderMinimap(file: TFile): Promise<void> {
		this.detachEditorScrollHandler();
		this.contentContainerEl.empty();
		this.contentContainerEl.addClass('long-view-minimap-mode');
		this.contentContainerEl.removeClass('long-view-paged-mode');

		if (this.minimapRenderer) {
			this.minimapRenderer.unload();
			this.minimapRenderer = null;
		}

		if (this.pages.length === 0) {
			this.contentContainerEl.createDiv({
				text: 'Document is empty',
				cls: 'long-view-empty'
			});
			return;
		}

		this.minimapRenderer = new MiniMapRenderer({
			app: this.app,
			containerEl: this.contentContainerEl,
			sourcePath: file.path,
			onSectionClick: (offset) => this.scrollToOffset(offset),
			onHeadingClick: (offset) => this.scrollToOffset(offset),
		});

		await this.minimapRenderer.initialize(this.pages);
		this.minimapRenderer.highlightHeadingForOffset(0);

		console.log(`Long View: Rendered minimap with ${this.pages.length} sections`);
	}

	private async renderPaged(file: TFile): Promise<void> {
		this.detachEditorScrollHandler();
		this.contentContainerEl.empty();
		this.contentContainerEl.addClass('long-view-paged-mode');
		this.contentContainerEl.removeClass('long-view-minimap-mode');

		if (this.minimapRenderer) {
			this.minimapRenderer.unload();
			this.minimapRenderer = null;
		}

		if (this.pages.length === 0) {
			this.contentContainerEl.createDiv({
				text: 'Document is empty',
				cls: 'long-view-empty'
			});
			return;
		}

		const grid = this.contentContainerEl.createDiv({ cls: 'long-view-grid' });

		// Apply initial zoom and layout before rendering content
		const scale = this.currentZoom / 100;
		grid.style.transform = `scale(${scale})`;
		grid.style.transformOrigin = 'top left';

		for (const page of this.pages) {
			const pageEl = grid.createDiv({ cls: 'long-view-page' });
			pageEl.setAttribute('data-page', String(page.pageNumber));

			// Add page number overlay in upper left
			// Font size scales inversely with zoom to always appear ~12px
			const pageNumberEl = pageEl.createDiv({ cls: 'long-view-page-number' });
			pageNumberEl.setText(String(page.pageNumber + 1));
			const scaledFontSize = 12 / (this.currentZoom / 100);
			pageNumberEl.style.fontSize = `${scaledFontSize}px`;

			// Content container
			const contentEl = pageEl.createDiv({ cls: 'long-view-page-content' });

			// Use simple fast renderer instead of full MarkdownRenderer
			try {
				renderPageContent(page.content, contentEl, this.currentZoom);
			} catch (error) {
				console.error('Long View: Error rendering page:', error);
				// Fallback to plain text if rendering fails
				contentEl.setText(page.content);
			}

			// Make page clickable to scroll to location in editor
			pageEl.addEventListener('click', (event) => {
				// Don't trigger if clicking a flag
				if ((event.target as HTMLElement).closest('.long-view-page-flag')) {
					return;
				}
				this.scrollToOffset(page.startOffset);
			});

			// Render flags for this page - show 50px bars at low zoom (< 20%)
			if (page.flags && page.flags.length > 0 && this.currentZoom < 20) {
				const flagsContainer = pageEl.createDiv({ cls: 'long-view-page-flags-low-zoom' });
				for (const flag of page.flags) {
					// Create a 50px colored bar
					const flagEl = flagsContainer.createDiv({ cls: 'long-view-page-flag-bar-small' });
					flagEl.style.backgroundColor = flag.color;

					// Make flag clickable
					flagEl.addEventListener('click', (event) => {
						event.stopPropagation();
						this.scrollToOffset(flag.startOffset);
					});
				}
			}
		}

		// Update column layout after content is rendered
		requestAnimationFrame(() => {
			this.updateZoom();
		});

		console.log(`Long View: Rendered ${this.pages.length} pages in paged mode`);
	}

	private updateZoom(): void {
		if (this.currentMode !== 'paged') {
			return;
		}

		const grid = this.contentContainerEl.querySelector('.long-view-grid') as HTMLElement;
		if (!grid) return;

		// Apply transform scale to the entire grid (camera zoom effect)
		const scale = this.currentZoom / 100;
		grid.style.transform = `scale(${scale})`;
		grid.style.transformOrigin = 'top left';

		// Calculate how many columns can fit based on zoom level
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

		// Update page number font sizes to maintain ~12px apparent size
		const pageNumbers = grid.querySelectorAll('.long-view-page-number') as NodeListOf<HTMLElement>;
		const scaledFontSize = 12 / scale;
		pageNumbers.forEach(pageNumber => {
			pageNumber.style.fontSize = `${scaledFontSize}px`;
		});

		console.log(`Long View: Zoom ${this.currentZoom}%, fitting ${columnsToFit} columns (effective width: ${effectivePageWidth}px)`);
	}

	private scrollToOffset(offset: number): void {
		if (!this.currentFile) {
			console.log('Long View: No current file');
			return;
		}

		const context = this.findMarkdownContext();
		if (!context) {
			console.log('Long View: No markdown view found for file:', this.currentFile?.path);
			return;
		}

		const { leaf, view } = context;
		const editor = view.editor;
		if (!editor) {
			console.log('Long View: No editor found in markdown view');
			return;
		}

		// Get full content
		const content = editor.getValue();

		// Find the paragraph that contains the start position
		const paragraphStart = this.findParagraphStart(content, offset);

		// Calculate line number from character offset
		const textBeforeParagraph = content.substring(0, paragraphStart);
		const lineNumber = textBeforeParagraph.split('\n').length - 1;

		console.log(`Long View: Scrolling to offset ${offset}, paragraph at line ${lineNumber}`);

		// Set cursor to target position
		const targetPos = { line: lineNumber, ch: 0 };
		editor.setCursor(targetPos);

		// Use requestAnimationFrame to ensure fresh measurement after layout settles
		requestAnimationFrame(() => {
			const cm = (editor as any).cm;
			let scrolled = false;

			if (cm) {
				// Handle CodeMirror 5 (used in Live Preview)
				if (typeof cm.charCoords === 'function' && typeof cm.scrollTo === 'function') {
					try {
						// Fresh measurement - get the line's position in the document
						const coords = cm.charCoords({ line: lineNumber, ch: 0 }, 'local');
						// Scroll to put this line at the top of the viewport
						cm.scrollTo(null, coords.top);
						scrolled = true;
					} catch (error) {
						console.warn('Long View: CodeMirror 5 scroll failed', error);
					}
				}
				// Handle CodeMirror 6 (newer Obsidian versions)
				else if (cm.scrollDOM) {
					try {
						const scrollEl = cm.scrollDOM;
						// Find the line element - fresh measurement
						const lineEl = cm.contentDOM?.querySelector(`.cm-line:nth-child(${lineNumber + 1})`);
						if (lineEl) {
							// Scroll the line to the top of the container
							const lineTop = (lineEl as HTMLElement).offsetTop;
							scrollEl.scrollTop = lineTop;
							scrolled = true;
						}
					} catch (error) {
						console.warn('Long View: CodeMirror 6 scroll failed', error);
					}
				}
			}

			// Fallback: use Obsidian's scrollIntoView
			if (!scrolled) {
				editor.scrollIntoView({ from: targetPos, to: targetPos }, false);
			}
		});

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
			console.log('Long View: Unable to locate scroll element for markdown view');
			return;
		}

		this.editorScrollEl = scrollElement;
			this.editorScrollEl.addEventListener('scroll', this.onEditorScroll, { passive: true });
			this.updateActiveHeading();
		}

	private detachEditorScrollHandler(): void {
		if (this.editorScrollEl) {
			this.editorScrollEl.removeEventListener('scroll', this.onEditorScroll);
			this.editorScrollEl = null;
		}

		this.activeLeaf = null;
	}

	private findMarkdownContext(): { leaf: WorkspaceLeaf; view: MarkdownView } | null {
		if (!this.currentFile) {
			return null;
		}

		const leaves = this.app.workspace.getLeavesOfType('markdown');
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
			const livePreviewScroller = root.querySelector<HTMLElement>('.cm-scroller');
			if (livePreviewScroller) {
				return livePreviewScroller;
			}

			const readingScroller = root.querySelector<HTMLElement>('.markdown-preview-view');
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
			const posToOffset: ((pos: { line: number; ch: number }) => number) | undefined =
				typeof anyEditor.posToOffset === 'function'
					? anyEditor.posToOffset.bind(anyEditor)
					: undefined;
			if (viewport && posToOffset) {
				const topLine = viewport.from ?? 0;
				const offset = posToOffset({ line: topLine, ch: 0 });
				this.minimapRenderer.highlightHeadingForOffset(offset);
				return;
			}
		} catch (error) {
			console.warn('Long View: Failed to derive viewport from editor', error);
		}

		const scrollEl = this.editorScrollEl;
		if (!scrollEl || this.documentLength === 0) {
			this.minimapRenderer.highlightHeadingForOffset(0);
			return;
		}

		const maxScroll = Math.max(1, scrollEl.scrollHeight - scrollEl.clientHeight);
		const ratio = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;
		const approxOffset = Math.min(this.documentLength, Math.floor(this.documentLength * ratio));
		this.minimapRenderer.highlightHeadingForOffset(approxOffset);
	}

	/**
	 * Find the start of the paragraph that contains the given offset
	 */
	private findParagraphStart(content: string, offset: number): number {
		// Look backwards from offset to find paragraph boundary
		// Paragraph boundaries are double newlines or start of document

		let pos = offset;

		// Skip any leading whitespace at the offset position
		while (pos > 0 && /\s/.test(content[pos - 1])) {
			pos--;
		}

		// Look for double newline or start of content
		while (pos > 0) {
			// Check for double newline (paragraph break)
			if (content[pos - 1] === '\n' && content[pos - 2] === '\n') {
				// Found paragraph break, return position after the double newline
				return pos;
			}

			// Check for heading (line starting with #)
			if (pos > 0 && content[pos - 1] === '\n' && content[pos] === '#') {
				return pos;
			}

			pos--;
		}

		// Reached start of document
		return 0;
	}
}
