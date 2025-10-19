import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { DocumentPage } from '../utils/documentParser';
import { paginateDocument } from '../utils/simplePagination';
import { MiniMapRenderer } from './miniMapRenderer';
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

		await this.renderMinimap(activeFile);
		this.bindToActiveEditor();
	}

	private async renderMinimap(file: TFile): Promise<void> {
		this.detachEditorScrollHandler();
		this.contentContainerEl.empty();

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

		// Scroll to the paragraph and align it near the top of the editor
		editor.setCursor({ line: lineNumber, ch: 0 });
		editor.scrollIntoView(
			{ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } },
			false
		);

		const cm = (editor as any).cm;
		if (cm && typeof cm.charCoords === 'function' && typeof cm.scrollTo === 'function') {
			window.requestAnimationFrame(() => {
				const coords = cm.charCoords({ line: lineNumber, ch: 0 }, 'local');
				cm.scrollTo(null, coords.top);
			});
		}

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
