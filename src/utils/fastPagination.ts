import { App, MarkdownRenderer, Component } from 'obsidian';
import { DocumentPage } from './documentParser';

export interface FastPaginationOptions {
	app: App;
	fontSize: number;
	paddingVertical: number;
	paddingHorizontal: number;
	pageWidth: number;
	pageHeight: number;
	sourcePath: string;
}

/**
 * Fast pagination that measures content to prevent overflow
 * Uses a simpler approach than binary search for better performance
 */
export class FastPaginator extends Component {
	private options: FastPaginationOptions;
	private measureContainer: HTMLElement | null = null;

	constructor(options: FastPaginationOptions) {
		super();
		this.options = options;
	}

	/**
	 * Parse document into pages with overflow prevention
	 */
	async parseDocument(text: string): Promise<DocumentPage[]> {
		if (!text || text.trim().length === 0) {
			return [];
		}

		this.setupMeasureContainer();

		const pages: DocumentPage[] = [];
		let currentOffset = 0;
		let pageNumber = 0;

		// Get all words with positions
		const wordPattern = /\S+/g;
		const wordMatches = Array.from(text.matchAll(wordPattern));

		if (wordMatches.length === 0) {
			return [];
		}

		// Get available height for content
		const availableHeight = this.options.pageHeight - (2 * this.options.paddingVertical);

		while (currentOffset < text.length) {
			// Find first word at or after current offset
			let startWordIndex = wordMatches.findIndex(match => match.index! >= currentOffset);
			if (startWordIndex === -1) break;

			// Estimate words per page
			const estimatedWords = this.estimateWordsPerPage();

			// Try to fit content
			const result = await this.fitContent(
				text,
				wordMatches,
				startWordIndex,
				estimatedWords,
				availableHeight
			);

			if (!result) break;

			pages.push({
				content: result.content,
				wordCount: result.wordCount,
				startOffset: result.startOffset,
				endOffset: result.endOffset,
				pageNumber: pageNumber++,
			});

			currentOffset = result.endOffset;

			// Safety check
			if (pageNumber > 10000) {
				console.warn('FastPaginator: Exceeded maximum page count');
				break;
			}
		}

		return pages;
	}

	/**
	 * Estimate words per page based on settings and images
	 */
	private estimateWordsPerPage(): number {
		const LINE_HEIGHT_MULTIPLIER = 1.6;
		const AVG_CHAR_WIDTH_RATIO = 0.55;
		const AVG_WORD_LENGTH = 6;

		const availableWidth = this.options.pageWidth - (2 * this.options.paddingHorizontal);
		const availableHeight = this.options.pageHeight - (2 * this.options.paddingVertical);

		const charWidth = this.options.fontSize * AVG_CHAR_WIDTH_RATIO;
		const charsPerLine = Math.floor(availableWidth / charWidth);

		const lineHeight = this.options.fontSize * LINE_HEIGHT_MULTIPLIER;
		const linesPerPage = Math.floor(availableHeight / lineHeight);

		const totalChars = charsPerLine * linesPerPage;
		const wordsPerPage = Math.floor(totalChars / AVG_WORD_LENGTH);

		// Return estimate, will be adjusted if content has images
		return Math.max(50, wordsPerPage);
	}

	/**
	 * Fit content to page with fast adjustment algorithm
	 */
	private async fitContent(
		text: string,
		wordMatches: RegExpMatchArray[],
		startWordIndex: number,
		estimatedWords: number,
		availableHeight: number
	): Promise<{ content: string; wordCount: number; startOffset: number; endOffset: number } | null> {
		let wordCount = estimatedWords;
		let attempts = 0;
		const maxAttempts = 3; // Much faster than binary search

		while (attempts < maxAttempts) {
			const endWordIndex = Math.min(startWordIndex + wordCount, wordMatches.length);
			if (endWordIndex <= startWordIndex) return null;

			const actualWordCount = endWordIndex - startWordIndex;
			const firstWord = wordMatches[startWordIndex];
			const lastWord = wordMatches[endWordIndex - 1];

			const startOffset = firstWord.index!;
			const endOffset = lastWord.index! + lastWord[0].length;
			const content = text.substring(startOffset, endOffset);

			// Measure content
			const height = await this.measureContentHeight(content);

			// Check if it fits
			if (height <= availableHeight) {
				// It fits! Try a bit more if we have room
				const utilizationRatio = height / availableHeight;
				if (utilizationRatio < 0.7 && attempts < maxAttempts - 1) {
					// Less than 70% full, try adding 40% more words
					wordCount = Math.floor(wordCount * 1.4);
					attempts++;
					continue;
				}
				// Good enough, return it
				return { content, wordCount: actualWordCount, startOffset, endOffset };
			} else {
				// Overflow! Reduce word count by 30%
				wordCount = Math.floor(wordCount * 0.7);
				attempts++;
			}
		}

		// After max attempts, return minimum viable page
		const minWordCount = Math.min(10, wordMatches.length - startWordIndex);
		const endWordIndex = startWordIndex + minWordCount;
		const firstWord = wordMatches[startWordIndex];
		const lastWord = wordMatches[endWordIndex - 1];
		const content = text.substring(firstWord.index!, lastWord.index! + lastWord[0].length);

		return {
			content,
			wordCount: minWordCount,
			startOffset: firstWord.index!,
			endOffset: lastWord.index! + lastWord[0].length,
		};
	}

	/**
	 * Measure rendered height of content
	 */
	private async measureContentHeight(markdown: string): Promise<number> {
		if (!this.measureContainer) return 0;

		const measureEl = this.measureContainer.createDiv({ cls: 'long-view-page-content' });
		measureEl.style.fontSize = `${this.options.fontSize}px`;
		measureEl.style.padding = `${this.options.paddingVertical}px ${this.options.paddingHorizontal}px`;
		measureEl.style.width = `${this.options.pageWidth}px`;
		measureEl.style.boxSizing = 'border-box';

		try {
			await MarkdownRenderer.render(
				this.options.app,
				markdown,
				measureEl,
				this.options.sourcePath,
				this
			);

			// Wait for images (with timeout)
			const images = measureEl.querySelectorAll('img');
			if (images.length > 0) {
				await Promise.race([
					this.waitForImages(images),
					new Promise(resolve => setTimeout(resolve, 500)) // 500ms timeout
				]);
			}

			const height = measureEl.scrollHeight;
			measureEl.remove();
			return height;
		} catch (error) {
			console.error('FastPaginator: Error measuring content:', error);
			measureEl.remove();
			// Return estimated height based on text length
			return markdown.length * 0.5; // Rough estimate
		}
	}

	/**
	 * Wait for images to load
	 */
	private async waitForImages(images: NodeListOf<HTMLImageElement>): Promise<void> {
		const promises = Array.from(images).map(img => {
			if (img.complete) return Promise.resolve();
			return new Promise<void>(resolve => {
				img.onload = () => resolve();
				img.onerror = () => resolve();
			});
		});
		await Promise.all(promises);
	}

	/**
	 * Setup off-screen measurement container
	 */
	private setupMeasureContainer(): void {
		if (this.measureContainer) return;

		this.measureContainer = document.createElement('div');
		this.measureContainer.style.position = 'absolute';
		this.measureContainer.style.left = '-9999px';
		this.measureContainer.style.top = '0';
		this.measureContainer.style.visibility = 'hidden';
		this.measureContainer.style.pointerEvents = 'none';

		document.body.appendChild(this.measureContainer);

		this.register(() => {
			if (this.measureContainer && this.measureContainer.parentNode) {
				this.measureContainer.parentNode.removeChild(this.measureContainer);
			}
			this.measureContainer = null;
		});
	}
}
