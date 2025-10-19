import { App, MarkdownRenderer, Component } from 'obsidian';

export interface MeasurementResult {
	contentHeight: number;
	hasImages: boolean;
	imageHeights: number[];
	totalImageHeight: number;
	wordCount: number;
}

export interface PageDimensions {
	width: number;
	height: number;
	paddingVertical: number;
	paddingHorizontal: number;
	fontSize: number;
}

/**
 * Measures the actual rendered height of markdown content
 * This is done by rendering to an off-screen element
 */
export class ContentMeasurer extends Component {
	private app: App;
	private measurementContainer: HTMLElement;
	private isSetup: boolean = false;

	constructor(app: App) {
		super();
		this.app = app;
	}

	/**
	 * Set up the off-screen measurement container
	 */
	setup(pageDimensions: PageDimensions): void {
		if (this.isSetup) {
			return;
		}

		// Create off-screen container for measurements
		this.measurementContainer = document.createElement('div');
		this.measurementContainer.style.position = 'absolute';
		this.measurementContainer.style.left = '-9999px';
		this.measurementContainer.style.top = '0';
		this.measurementContainer.style.width = `${pageDimensions.width}px`;
		this.measurementContainer.style.visibility = 'hidden';
		this.measurementContainer.style.pointerEvents = 'none';

		document.body.appendChild(this.measurementContainer);
		this.isSetup = true;

		// Clean up when component unloads
		this.register(() => {
			if (this.measurementContainer && this.measurementContainer.parentNode) {
				this.measurementContainer.parentNode.removeChild(this.measurementContainer);
			}
			this.isSetup = false;
		});
	}

	/**
	 * Measure the rendered height of markdown content
	 */
	async measureContent(
		markdown: string,
		pageDimensions: PageDimensions,
		sourcePath: string
	): Promise<MeasurementResult> {
		if (!this.isSetup) {
			this.setup(pageDimensions);
		}

		// Create a measurement element with the same styling as page content
		const measureEl = this.measurementContainer.createDiv({
			cls: 'long-view-page-content'
		});

		// Apply the same styles as the actual page
		measureEl.style.padding = `${pageDimensions.paddingVertical}px ${pageDimensions.paddingHorizontal}px`;
		measureEl.style.fontSize = `${pageDimensions.fontSize}px`;
		measureEl.style.lineHeight = '1.6';
		measureEl.style.width = `${pageDimensions.width}px`;
		measureEl.style.boxSizing = 'border-box';

		// Render the markdown
		try {
			await MarkdownRenderer.render(
				this.app,
				markdown,
				measureEl,
				sourcePath,
				this
			);
		} catch (error) {
			console.error('ContentMeasurer: Error rendering markdown:', error);
			measureEl.setText(markdown);
		}

		// Wait for images to load
		const images = measureEl.querySelectorAll('img');
		await this.waitForImages(images);

		// Measure the content
		const contentHeight = measureEl.scrollHeight;
		const imageHeights: number[] = [];
		let totalImageHeight = 0;

		images.forEach((img) => {
			const imgHeight = img.offsetHeight;
			imageHeights.push(imgHeight);
			totalImageHeight += imgHeight;
		});

		// Count words
		const text = measureEl.textContent || '';
		const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

		// Clean up
		measureEl.remove();

		return {
			contentHeight,
			hasImages: images.length > 0,
			imageHeights,
			totalImageHeight,
			wordCount,
		};
	}

	/**
	 * Wait for all images in a collection to load
	 */
	private async waitForImages(images: NodeListOf<HTMLImageElement>): Promise<void> {
		const promises: Promise<void>[] = [];

		images.forEach((img) => {
			if (img.complete) {
				return;
			}

			promises.push(
				new Promise((resolve, reject) => {
					img.onload = () => resolve();
					img.onerror = () => resolve(); // Resolve even on error to not block

					// Timeout after 5 seconds
					setTimeout(() => resolve(), 5000);
				})
			);
		});

		await Promise.all(promises);
	}

	/**
	 * Calculate available content height for a page
	 */
	getAvailableContentHeight(pageDimensions: PageDimensions): number {
		return pageDimensions.height - (2 * pageDimensions.paddingVertical);
	}

	/**
	 * Check if content fits within page bounds
	 */
	doesContentFit(
		measurement: MeasurementResult,
		pageDimensions: PageDimensions
	): boolean {
		const availableHeight = this.getAvailableContentHeight(pageDimensions);
		return measurement.contentHeight <= availableHeight;
	}

	/**
	 * Estimate a good starting word count for a page
	 */
	estimateStartingWordCount(pageDimensions: PageDimensions): number {
		const LINE_HEIGHT_MULTIPLIER = 1.6;
		const AVG_CHAR_WIDTH_RATIO = 0.55;
		const AVG_WORD_LENGTH = 6;

		const availableWidth = pageDimensions.width - (2 * pageDimensions.paddingHorizontal);
		const availableHeight = this.getAvailableContentHeight(pageDimensions);

		const charWidth = pageDimensions.fontSize * AVG_CHAR_WIDTH_RATIO;
		const charsPerLine = Math.floor(availableWidth / charWidth);

		const lineHeight = pageDimensions.fontSize * LINE_HEIGHT_MULTIPLIER;
		const linesPerPage = Math.floor(availableHeight / lineHeight);

		const totalChars = charsPerLine * linesPerPage;
		const wordsPerPage = Math.floor(totalChars / AVG_WORD_LENGTH);

		return Math.max(50, wordsPerPage);
	}
}
