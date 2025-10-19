import { App, Component, TFile } from 'obsidian';
import { DocumentHeading, DocumentPage, DocumentFlag, getFirstWords, computeHeadingCalloutStacks } from '../utils/documentParser';

export interface MiniMapOptions {
	app: App;
	containerEl: HTMLElement;
	sourcePath: string;
	onSectionClick?: (offset: number) => void;
	onHeadingClick?: (offset: number) => void;
	showParagraphs?: boolean;
	numberSections?: boolean;
}

interface RenderedSection {
	page: DocumentPage;
	containerEl: HTMLElement;
}

type ContentFragment =
	| { type: 'text'; text: string; startOffset: number }
	| { type: 'image'; alt: string; link: string; startOffset: number }
	| { type: 'heading'; heading: DocumentHeading }
	| { type: 'flag'; flag: DocumentFlag };

export class MiniMapRenderer extends Component {
	private readonly options: MiniMapOptions;
	private minimapRootEl: HTMLElement | null = null;
	private contentWrapperEl: HTMLElement | null = null;
	private sections: RenderedSection[] = [];
	private pages: DocumentPage[] = [];
	private headingNumberMap: Map<number, string> = new Map();
	private headingEntries: Array<{ offset: number; element: HTMLElement }> = [];
	private activeHeadingEl: HTMLElement | null = null;
	private currentHeadingLevel: number = 0;
	private currentCalloutStack: Array<{ color: string }> = [];
	// Map from heading offset to its callout stack
	private headingCalloutStacks: Map<number, Array<{ color: string }>> = new Map();

	constructor(options: MiniMapOptions) {
		super();
		this.options = options;
	}

	async initialize(pages: DocumentPage[]): Promise<void> {
		this.pages = pages;
		this.cleanup();
		this.computeHeadingNumbers();
		this.computeHeadingCalloutStacks();
		this.currentHeadingLevel = 0;
		this.currentCalloutStack = [];

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

		// Track current state for rendering
		let currentCalloutStack = this.currentCalloutStack.slice();
		let activeCalloutStack: Array<{ color: string }> = [];
		let currentLevel = this.currentHeadingLevel;
		let flowEl: HTMLElement | null = null;

		// Track currently open callout wrapper elements
		let openCalloutWrappers: HTMLElement[] = [];

		// Helper to update callout wrappers based on new stack
		const updateCalloutWrappers = (newStack: Array<{ color: string }>): HTMLElement => {
			// Find common prefix length
			let commonPrefixLen = 0;
			while (
				commonPrefixLen < Math.min(activeCalloutStack.length, newStack.length) &&
				activeCalloutStack[commonPrefixLen].color === newStack[commonPrefixLen].color
			) {
				commonPrefixLen++;
			}

			// Keep only the common prefix wrappers
			openCalloutWrappers = openCalloutWrappers.slice(0, commonPrefixLen);

			// Determine where to append new wrappers
			let container = openCalloutWrappers.length > 0
				? openCalloutWrappers[openCalloutWrappers.length - 1]
				: contentEl;

			// Add new wrappers for the rest of the stack
			for (let i = commonPrefixLen; i < newStack.length; i++) {
				const callout = newStack[i];
				const calloutWrapper = container.createDiv({ cls: 'long-view-minimap-callout-bg' });
				const rgbMatch = callout.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
				if (rgbMatch) {
					const [, r, g, b] = rgbMatch;
					calloutWrapper.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
				} else {
					calloutWrapper.style.backgroundColor = callout.color;
					calloutWrapper.style.opacity = '0.15';
				}
				openCalloutWrappers.push(calloutWrapper);
				container = calloutWrapper;
			}

			// Update active callout stack to reflect wrappers we just built
			activeCalloutStack = newStack.map(callout => ({ color: callout.color }));

			return container;
		};

		// Helper to create section-specific structure (hierarchy bars + section body)
		const createSectionStructure = (container: HTMLElement, level: number): HTMLElement => {
			// Create nested divs for hierarchy bars
			for (let l = 2; l <= level; l++) {
				const hierarchyDiv = container.createDiv({ cls: 'long-view-minimap-hierarchy-level' });
				container = hierarchyDiv;
			}

			return container.createDiv({ cls: 'long-view-minimap-section-body' });
		};

		try {
			const fragments = this.tokenizeContent(page);
			for (const fragment of fragments) {
				if (fragment.type === 'heading') {
					const headingInfo = fragment.heading;

					// Get the callout stack for this heading
					const headingStack = this.headingCalloutStacks.get(headingInfo.startOffset) || [];

					// Check if we need to update wrappers or create new section structure
					const stackChanged =
						headingStack.length !== currentCalloutStack.length ||
						headingStack.some((callout, index) => callout.color !== currentCalloutStack[index]?.color);
					const levelChanged = headingInfo.level !== currentLevel;

					if (stackChanged || levelChanged || !flowEl) {

						// Get the container (with updated callout wrappers)
						// IMPORTANT: Pass headingStack BEFORE updating currentCalloutStack!
						const calloutContainer = updateCalloutWrappers(headingStack);

						// Update current stack AFTER updateCalloutWrappers has compared
						currentCalloutStack = headingStack.slice();

						// Create new section structure for this heading
						currentLevel = headingInfo.level;
						flowEl = createSectionStructure(calloutContainer, currentLevel);
					}

					// Update current heading level for next iteration
					this.currentHeadingLevel = headingInfo.level;

					const numbering = this.headingNumberMap.get(headingInfo.startOffset);
					const headingEl = flowEl.createDiv({ cls: 'long-view-minimap-heading' });

					// Show numbering only if numberSections is enabled
					const showNumbering = this.options.numberSections !== false;
					const headingText = (showNumbering && numbering) ? `${numbering} ${headingInfo.text}` : headingInfo.text;
					headingEl.setText(headingText);

					headingEl.dataset.offset = String(headingInfo.startOffset);
					headingEl.dataset.level = String(headingInfo.level);
					headingEl.addEventListener('click', (event) => {
						event.preventDefault();
						event.stopPropagation();
						this.options.onHeadingClick?.(headingInfo.startOffset);
					});
					this.headingEntries.push({ offset: headingInfo.startOffset, element: headingEl });

					// If this heading has a callout, display the callout title below it at 0.5 opacity
					if (headingInfo.callout) {
						const calloutTitleEl = flowEl.createDiv({ cls: 'long-view-minimap-callout-title' });
						calloutTitleEl.setText(headingInfo.callout.title);
					}
				} else if (fragment.type === 'text') {
					// Ensure we have a flowEl for content before any heading
					if (!flowEl) {
						const calloutContainer = updateCalloutWrappers(currentCalloutStack);
						flowEl = createSectionStructure(calloutContainer, currentLevel);
					}
					// Only render paragraphs if the setting is enabled
					const showParagraphs = this.options.showParagraphs !== false;
					if (showParagraphs) {
						const lines = this.tokenizeLines(fragment.text);
						for (const line of lines) {
							flowEl.createEl('p', {
								cls: 'long-view-minimap-line',
								text: line,
							});
						}
					}
				} else if (fragment.type === 'image') {
					if (!flowEl) {
						const calloutContainer = updateCalloutWrappers(currentCalloutStack);
						flowEl = createSectionStructure(calloutContainer, currentLevel);
					}
					const src = this.resolveImageSrc(fragment.link);
					if (!src) {
						continue;
					}
					const imgEl = flowEl.createEl('img', { cls: 'long-view-minimap-image' });
					imgEl.src = src;
					imgEl.alt = fragment.alt || fragment.link;
				} else if (fragment.type === 'flag') {
					if (!flowEl) {
						const calloutContainer = updateCalloutWrappers(currentCalloutStack);
						flowEl = createSectionStructure(calloutContainer, currentLevel);
					}
					const flagInfo = fragment.flag;
					const flagEl = flowEl.createDiv({ cls: 'long-view-minimap-flag' });
					flagEl.style.backgroundColor = flagInfo.color;

					// Show only the message, not the type name
					const messagePreview = getFirstWords(flagInfo.message, 10);
					const messageEl = flagEl.createSpan({ cls: 'long-view-minimap-flag-message', text: messagePreview });

					// Make flag clickable
					flagEl.addEventListener('click', (event) => {
						event.preventDefault();
						event.stopPropagation();
						this.options.onHeadingClick?.(flagInfo.startOffset);
					});
				}
			}

			this.sections.push({ page, containerEl: sectionEl });
		} catch (error) {
			console.error('MiniMapRenderer: Failed to render section', error);
			contentEl.setText(page.content);
		}

		// Persist state so the next section inherits current context
		this.currentCalloutStack = currentCalloutStack.slice();
		this.currentHeadingLevel = currentLevel;
	}

	private tokenizeContent(page: DocumentPage): ContentFragment[] {
		const fragments: ContentFragment[] = [];
		const headings = (page.headings ?? []).slice().sort((a, b) => a.startOffset - b.startOffset);
		const flags = (page.flags ?? []).slice().sort((a, b) => a.startOffset - b.startOffset);
		const content = page.content;
		const base = page.startOffset;

		// Create a merged sorted list of all special items (headings and flags)
		const specialItems: Array<{ type: 'heading' | 'flag'; offset: number; data: DocumentHeading | DocumentFlag }> = [
			...headings.map(h => ({ type: 'heading' as const, offset: h.startOffset, data: h })),
			...flags.map(f => ({ type: 'flag' as const, offset: f.startOffset, data: f })),
		].sort((a, b) => a.offset - b.offset);

		let cursor = 0;

		const pushText = (segment: string, segmentStart: number) => {
			fragments.push(...this.extractTextAndImages(segment, segmentStart));
		};

		for (const item of specialItems) {
			const relativeStart = Math.max(0, item.offset - base);
			if (relativeStart > cursor) {
				const beforeItem = content.substring(cursor, relativeStart);
				pushText(beforeItem, base + cursor);
			}

			if (item.type === 'heading') {
				fragments.push({ type: 'heading', heading: item.data as DocumentHeading });
				cursor = this.findHeadingLineEnd(content, relativeStart);
			} else if (item.type === 'flag') {
				fragments.push({ type: 'flag', flag: item.data as DocumentFlag });
				// Skip past the flag in the content
				// Try both patterns: ==TYPE: message == and %% comment %%
				const flagPattern = /==\w+:[^=]+==|%%[^%]+%%/;
				const match = content.substring(relativeStart).match(flagPattern);
				if (match) {
					cursor = relativeStart + match[0].length;
				} else {
					cursor = relativeStart;
				}
			}
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
			.replace(/==\w+:[^=]+==/g, '') // Remove flags
			.replace(/%%[^%]+%%/g, '') // Remove comments
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

	private computeHeadingCalloutStacks(): void {
		this.headingCalloutStacks = computeHeadingCalloutStacks(this.pages);
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

		const bodyFontSize = 3; // increased from 2px
		const lineHeight = 1.25;
		const headingBase = 12;

		this.contentWrapperEl.style.setProperty('--long-view-minimap-font-size', `${bodyFontSize}px`);
		this.contentWrapperEl.style.setProperty('--long-view-minimap-line-height', lineHeight.toFixed(2));
		this.contentWrapperEl.style.setProperty('--long-view-minimap-heading-font-base', `${headingBase}px`);
	}

	cleanup(): void {
		this.sections = [];
		this.headingNumberMap.clear();
		this.headingCalloutStacks.clear();
		this.headingEntries = [];
		this.activeHeadingEl = null;
		this.currentHeadingLevel = 0;
		this.currentCalloutStack = [];

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
