import { App, Component, TFile } from 'obsidian';
import { DocumentHeading, DocumentPage } from '../utils/documentParser';

export interface MiniMapOptions {
	app: App;
	containerEl: HTMLElement;
	sourcePath: string;
	onSectionClick?: (offset: number) => void;
	onHeadingClick?: (offset: number) => void;
}

interface RenderedSection {
	page: DocumentPage;
	containerEl: HTMLElement;
}

type ContentFragment =
	| { type: 'text'; text: string; startOffset: number }
	| { type: 'image'; alt: string; link: string; startOffset: number }
	| { type: 'heading'; heading: DocumentHeading };

export class MiniMapRenderer extends Component {
	private readonly options: MiniMapOptions;
	private minimapRootEl: HTMLElement | null = null;
	private contentWrapperEl: HTMLElement | null = null;
	private sections: RenderedSection[] = [];
	private pages: DocumentPage[] = [];
	private headingNumberMap: Map<number, string> = new Map();
	private headingEntries: Array<{ offset: number; element: HTMLElement }> = [];
	private activeHeadingEl: HTMLElement | null = null;

	constructor(options: MiniMapOptions) {
		super();
		this.options = options;
	}

	async initialize(pages: DocumentPage[]): Promise<void> {
		this.pages = pages;
		this.cleanup();
		this.computeHeadingNumbers();

		this.minimapRootEl = this.options.containerEl.createDiv({ cls: 'long-view-minimap' });
		this.contentWrapperEl = this.minimapRootEl.createDiv({ cls: 'long-view-minimap-content' });

		for (const page of pages) {
			const sectionEl = this.createSectionContainer(page);
			this.contentWrapperEl.appendChild(sectionEl);
			this.renderSection(sectionEl, page);
		}

		this.applyBaseStyles();
	}

	getMinimapElement(): HTMLElement | null {
		return this.minimapRootEl;
	}

	private createSectionContainer(page: DocumentPage): HTMLElement {
		const sectionEl = document.createElement('div');
		sectionEl.dataset.start = String(page.startOffset);
		sectionEl.dataset.end = String(page.endOffset);
		sectionEl.addEventListener('click', (event) => {
			const rect = sectionEl.getBoundingClientRect();
			const relativeY = event.clientY - rect.top;
			const ratio = rect.height > 0 ? Math.min(1, Math.max(0, relativeY / rect.height)) : 0;
			const span = Math.max(1, page.endOffset - page.startOffset);
			const targetOffset = page.startOffset + Math.round(span * ratio);
			this.options.onSectionClick?.(targetOffset);
		});
		return sectionEl;
	}

	private renderSection(sectionEl: HTMLElement, page: DocumentPage): void {
		const contentEl = sectionEl.createDiv({ cls: 'long-view-minimap-section-content' });
		const flowEl = contentEl.createDiv({ cls: 'long-view-minimap-section-body' });

		try {
			const fragments = this.tokenizeContent(page);
			for (const fragment of fragments) {
				if (fragment.type === 'heading') {
					const headingInfo = fragment.heading;
					const numbering = this.headingNumberMap.get(headingInfo.startOffset);
					const headingEl = flowEl.createDiv({ cls: 'long-view-minimap-heading' });
					headingEl.setText(numbering ? `${numbering} ${headingInfo.text}` : headingInfo.text);
					headingEl.dataset.offset = String(headingInfo.startOffset);
					headingEl.dataset.level = String(headingInfo.level);
					headingEl.addEventListener('click', (event) => {
						event.preventDefault();
						event.stopPropagation();
						this.options.onHeadingClick?.(headingInfo.startOffset);
					});
					this.headingEntries.push({ offset: headingInfo.startOffset, element: headingEl });
				} else if (fragment.type === 'text') {
					const lines = this.tokenizeLines(fragment.text);
					for (const line of lines) {
						flowEl.createEl('p', {
							cls: 'long-view-minimap-line',
							text: line,
						});
					}
				} else if (fragment.type === 'image') {
					const src = this.resolveImageSrc(fragment.link);
					if (!src) {
						continue;
					}
					const imgEl = flowEl.createEl('img', { cls: 'long-view-minimap-image' });
					imgEl.src = src;
					imgEl.alt = fragment.alt || fragment.link;
				}
			}

			this.sections.push({ page, containerEl: sectionEl });
		} catch (error) {
			console.error('MiniMapRenderer: Failed to render section', error);
			contentEl.setText(page.content);
		}
	}

	private tokenizeContent(page: DocumentPage): ContentFragment[] {
		const fragments: ContentFragment[] = [];
		const headings = (page.headings ?? []).slice().sort((a, b) => a.startOffset - b.startOffset);
		const content = page.content;
		const base = page.startOffset;
		let cursor = 0;

		const pushText = (segment: string, segmentStart: number) => {
			fragments.push(...this.extractTextAndImages(segment, segmentStart));
		};

		for (const heading of headings) {
			const relativeStart = Math.max(0, heading.startOffset - base);
			if (relativeStart > cursor) {
				const beforeHeading = content.substring(cursor, relativeStart);
				pushText(beforeHeading, base + cursor);
			}

			fragments.push({ type: 'heading', heading });

			cursor = this.findHeadingLineEnd(content, relativeStart);
		}

		if (cursor < content.length) {
			const tail = content.substring(cursor);
			pushText(tail, base + cursor);
		}

		return fragments;
	}

	private extractTextAndImages(content: string, segmentStart: number): ContentFragment[] {
		const fragments: ContentFragment[] = [];
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)|!\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		const pushTextLines = (text: string, startOffset: number) => {
			if (text.trim().length === 0) {
				return;
			}
			const lines = this.tokenizeLines(text);
			for (const line of lines) {
				fragments.push({ type: 'text', text: line, startOffset });
			}
		};

		while ((match = imageRegex.exec(content)) !== null) {
			if (match.index > lastIndex) {
				const preceding = content.substring(lastIndex, match.index);
				pushTextLines(preceding, segmentStart + lastIndex);
			}

			if (match[2]) {
				const parsedLink = this.parseMarkdownImageLink(match[2]);
				fragments.push({
					type: 'image',
					alt: match[1] || '',
					link: parsedLink,
					startOffset: segmentStart + match.index,
				});
			} else {
				const target = match[3]?.trim() ?? '';
				const alt = (match[4] ?? '').trim();
				fragments.push({
					type: 'image',
					alt: alt || target,
					link: target,
					startOffset: segmentStart + match.index,
				});
			}

			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < content.length) {
			const trailing = content.substring(lastIndex);
			pushTextLines(trailing, segmentStart + lastIndex);
		}

		return fragments;
	}

	private findHeadingLineEnd(content: string, relativeStart: number): number {
		let end = content.indexOf('\n', relativeStart);
		if (end === -1) {
			return content.length;
		}

		let next = end + 1;
		while (next < content.length && content[next] === '\n') {
			next++;
		}

		return next;
	}

	private tokenizeLines(text: string): string[] {
		return text
			.replace(/\r\n/g, '\n')
			.split(/\n+/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#'))
			.map((line) => this.sanitizeLine(line))
			.filter((line) => line.length > 0);
	}

	private sanitizeLine(line: string): string {
		return line
			.replace(/^#{1,6}\s+/g, '')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/_([^_]+)_/g, '$1')
			.replace(/~~([^~]+)~~/g, '$1')
			.replace(/\[(.*?)\]\((.*?)\)/g, '$1')
			.replace(/>\s*/g, '')
			.replace(/\!\[[^\]]*\]\([^)]*\)/g, '')
			.replace(/!\[\[[^\]]*\]\]/g, '')
			.trim();
	}

	private resolveImageSrc(link: string): string | null {
		let trimmed = link.trim();
		if (!trimmed) {
			return null;
		}

		if (/^(app:|https?:|data:)/i.test(trimmed)) {
			return trimmed;
		}

		const normalized = trimmed.replace(/\\/g, '/');
		const [pathPart] = normalized.split('#');
		const targetFile = this.options.app.metadataCache.getFirstLinkpathDest(pathPart, this.options.sourcePath);
		if (targetFile instanceof TFile) {
			return this.options.app.vault.getResourcePath(targetFile);
		}

		// Attempt to resolve standard markdown links relative to vault root
		const fallbackFile = this.options.app.metadataCache.getFirstLinkpathDest(trimmed, this.options.sourcePath);
		if (fallbackFile instanceof TFile) {
			return this.options.app.vault.getResourcePath(fallbackFile);
		}

		// Last resort: return encoded original link so external paths still render
		try {
			return encodeURI(trimmed);
		} catch (error) {
			console.warn('MiniMapRenderer: Failed to encode image link', trimmed, error);
			return trimmed;
		}
}

	private parseMarkdownImageLink(spec: string): string {
		let trimmed = spec.trim();
		if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
			trimmed = trimmed.slice(1, -1).trim();
		}

		const titleMatch = trimmed.match(/\s+(".*"|'.*'|\(.*\))$/);
		if (titleMatch && titleMatch.index !== undefined) {
			trimmed = trimmed.substring(0, titleMatch.index).trim();
		}

		return trimmed;
	}

	private computeHeadingNumbers(): void {
		this.headingNumberMap.clear();
		this.headingEntries = [];
		const counters = [0, 0, 0, 0, 0, 0];

		for (const page of this.pages) {
			if (!page.headings) continue;

			for (const heading of page.headings) {
				const level = Math.min(Math.max(heading.level, 1), 6);
				const index = level - 1;
				counters[index] += 1;
				for (let i = index + 1; i < counters.length; i++) {
					counters[i] = 0;
				}

				const parts = [] as string[];
				for (let i = 0; i <= index; i++) {
					if (counters[i] === 0) continue;
					parts.push(String(counters[i]));
				}

				const numbering = parts.join('.');
				this.headingNumberMap.set(heading.startOffset, numbering);
			}
		}
	}

	private setActiveHeading(element: HTMLElement | null): void {
		if (this.activeHeadingEl === element) {
			return;
		}

		if (this.activeHeadingEl) {
			this.activeHeadingEl.removeClass('is-active');
		}

		this.activeHeadingEl = element;

		if (this.activeHeadingEl) {
			this.activeHeadingEl.addClass('is-active');
		}
	}

	highlightHeadingForOffset(offset: number): void {
		if (this.headingEntries.length === 0) {
			this.setActiveHeading(null);
			return;
		}

		let candidate: HTMLElement | null = this.headingEntries[0].element;
		for (const entry of this.headingEntries) {
			if (entry.offset <= offset) {
				candidate = entry.element;
			} else {
				break;
			}
		}

		this.setActiveHeading(candidate);
	}

	private applyBaseStyles(): void {
		if (!this.contentWrapperEl) {
			return;
		}

		const bodyFontSize = 2; // keep paragraph text one pixel smaller than previous 3px
		const lineHeight = 1.25;
		const headingBase = 12;

		this.contentWrapperEl.style.setProperty('--long-view-minimap-font-size', `${bodyFontSize}px`);
		this.contentWrapperEl.style.setProperty('--long-view-minimap-line-height', lineHeight.toFixed(2));
		this.contentWrapperEl.style.setProperty('--long-view-minimap-heading-font-base', `${headingBase}px`);
	}

	cleanup(): void {
		this.sections = [];
		this.headingNumberMap.clear();
		this.headingEntries = [];
		this.activeHeadingEl = null;

		if (this.minimapRootEl) {
			this.minimapRootEl.remove();
			this.minimapRootEl = null;
			this.contentWrapperEl = null;
		}
	}

	onunload(): void {
		this.cleanup();
	}
}
