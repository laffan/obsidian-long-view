import { App } from 'obsidian';
import { DocumentPage } from './documentParser';
import { ContentMeasurer, PageDimensions, MeasurementResult } from './contentMeasurement';

export interface AdaptivePaginationOptions {
	app: App;
	pageDimensions: PageDimensions;
	sourcePath: string;
	targetWordsPerPage?: number;
	maxIterations?: number;
}

/**
 * Adaptively paginate content by measuring actual rendered height
 * This ensures content fits within page bounds and accounts for images
 */
export class AdaptivePaginator {
	private measurer: ContentMeasurer;
	private options: Required<AdaptivePaginationOptions>;

	constructor(options: AdaptivePaginationOptions) {
		this.measurer = new ContentMeasurer(options.app);
		this.options = {
			...options,
			targetWordsPerPage: options.targetWordsPerPage ?? 500,
			maxIterations: options.maxIterations ?? 10,
		};
	}

	/**
	 * Parse document into pages using adaptive pagination
	 */
	async parseDocument(text: string): Promise<DocumentPage[]> {
		if (!text || text.trim().length === 0) {
			return [];
		}

		// Set up the measurer
		this.measurer.setup(this.options.pageDimensions);

		const pages: DocumentPage[] = [];
		let currentOffset = 0;
		let pageNumber = 0;

		// Get all words with their positions
		const wordPattern = /\S+/g;
		const wordMatches = Array.from(text.matchAll(wordPattern));

		if (wordMatches.length === 0) {
			return [];
		}

		while (currentOffset < text.length) {
			const pageResult = await this.createPage(
				text,
				wordMatches,
				currentOffset,
				pageNumber
			);

			if (!pageResult) {
				// No more content to paginate
				break;
			}

			pages.push(pageResult.page);
			currentOffset = pageResult.nextOffset;
			pageNumber++;

			// Safety check to prevent infinite loops
			if (pageNumber > 10000) {
				console.warn('AdaptivePaginator: Exceeded maximum page count, stopping pagination');
				break;
			}
		}

		return pages;
	}

	/**
	 * Create a single page starting from the given offset
	 */
	private async createPage(
		text: string,
		wordMatches: RegExpMatchArray[],
		startOffset: number,
		pageNumber: number
	): Promise<{ page: DocumentPage; nextOffset: number } | null> {
		// Find the first word at or after startOffset
		let startWordIndex = wordMatches.findIndex(
			match => match.index! >= startOffset
		);

		if (startWordIndex === -1) {
			return null;
		}

		// Start with estimated word count
		const estimatedWords = this.measurer.estimateStartingWordCount(
			this.options.pageDimensions
		);

		// Use binary search to find the optimal word count
		const result = await this.findOptimalWordCount(
			text,
			wordMatches,
			startWordIndex,
			estimatedWords
		);

		if (!result) {
			return null;
		}

		const { wordCount, content, measurement } = result;

		const firstWord = wordMatches[startWordIndex];
		const lastWord = wordMatches[startWordIndex + wordCount - 1];

		const actualStartOffset = firstWord.index!;
		const actualEndOffset = lastWord.index! + lastWord[0].length;

		const page: DocumentPage = {
			content,
			wordCount,
			startOffset: actualStartOffset,
			endOffset: actualEndOffset,
			pageNumber,
		};

		return {
			page,
			nextOffset: actualEndOffset,
		};
	}

	/**
	 * Use binary search to find optimal word count that fits in page
	 */
	private async findOptimalWordCount(
		text: string,
		wordMatches: RegExpMatchArray[],
		startWordIndex: number,
		estimatedWords: number
	): Promise<{ wordCount: number; content: string; measurement: MeasurementResult } | null> {
		let minWords = 10; // Minimum words per page
		let maxWords = Math.min(
			estimatedWords * 2,
			wordMatches.length - startWordIndex
		);

		if (maxWords < minWords) {
			maxWords = minWords;
		}

		let bestFit: { wordCount: number; content: string; measurement: MeasurementResult } | null = null;
		let iterations = 0;

		// Try the estimated word count first
		const estimatedResult = await this.tryWordCount(
			text,
			wordMatches,
			startWordIndex,
			Math.min(estimatedWords, maxWords)
		);

		if (estimatedResult && this.measurer.doesContentFit(
			estimatedResult.measurement,
			this.options.pageDimensions
		)) {
			bestFit = estimatedResult;
			minWords = estimatedResult.wordCount;
		} else if (estimatedResult) {
			maxWords = estimatedResult.wordCount;
		}

		// Binary search for optimal word count
		while (minWords < maxWords && iterations < this.options.maxIterations) {
			const midWords = Math.floor((minWords + maxWords + 1) / 2);
			const result = await this.tryWordCount(
				text,
				wordMatches,
				startWordIndex,
				midWords
			);

			if (!result) {
				break;
			}

			const fits = this.measurer.doesContentFit(
				result.measurement,
				this.options.pageDimensions
			);

			if (fits) {
				bestFit = result;
				minWords = midWords;
			} else {
				maxWords = midWords - 1;
			}

			iterations++;
		}

		// If no fit found, use minimum words
		if (!bestFit) {
			const fallbackResult = await this.tryWordCount(
				text,
				wordMatches,
				startWordIndex,
				10
			);
			if (fallbackResult) {
				bestFit = fallbackResult;
			}
		}

		return bestFit;
	}

	/**
	 * Try rendering a specific word count and measure it
	 */
	private async tryWordCount(
		text: string,
		wordMatches: RegExpMatchArray[],
		startWordIndex: number,
		wordCount: number
	): Promise<{ wordCount: number; content: string; measurement: MeasurementResult } | null> {
		const endWordIndex = Math.min(
			startWordIndex + wordCount,
			wordMatches.length
		);

		if (endWordIndex <= startWordIndex) {
			return null;
		}

		const actualWordCount = endWordIndex - startWordIndex;
		const firstWord = wordMatches[startWordIndex];
		const lastWord = wordMatches[endWordIndex - 1];

		const startOffset = firstWord.index!;
		const endOffset = lastWord.index! + lastWord[0].length;

		const content = text.substring(startOffset, endOffset);

		// Measure the content
		const measurement = await this.measurer.measureContent(
			content,
			this.options.pageDimensions,
			this.options.sourcePath
		);

		return {
			wordCount: actualWordCount,
			content,
			measurement,
		};
	}

	/**
	 * Clean up resources
	 */
	cleanup(): void {
		this.measurer.unload();
	}
}
