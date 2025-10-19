import { App, MarkdownRenderer, Component } from 'obsidian';

export interface CanvasPageRenderOptions {
	width: number;
	height: number;
	scale?: number;
	sourcePath: string;
}

/**
 * Renders markdown content to a canvas for better performance
 */
export class CanvasPageRenderer extends Component {
	private app: App;
	private renderContainer: HTMLElement;
	private isSetup: boolean = false;

	constructor(app: App) {
		super();
		this.app = app;
	}

	/**
	 * Set up the off-screen rendering container
	 */
	setup(): void {
		if (this.isSetup) {
			return;
		}

		// Create off-screen container for rendering
		this.renderContainer = document.createElement('div');
		this.renderContainer.style.position = 'absolute';
		this.renderContainer.style.left = '-9999px';
		this.renderContainer.style.top = '0';
		this.renderContainer.style.visibility = 'hidden';
		this.renderContainer.style.pointerEvents = 'none';

		document.body.appendChild(this.renderContainer);
		this.isSetup = true;

		// Clean up when component unloads
		this.register(() => {
			if (this.renderContainer && this.renderContainer.parentNode) {
				this.renderContainer.parentNode.removeChild(this.renderContainer);
			}
			this.isSetup = false;
		});
	}

	/**
	 * Render markdown content to a canvas
	 */
	async renderToCanvas(
		markdown: string,
		canvas: HTMLCanvasElement,
		options: CanvasPageRenderOptions
	): Promise<void> {
		if (!this.isSetup) {
			this.setup();
		}

		const scale = options.scale ?? 1;
		const scaledWidth = options.width * scale;
		const scaledHeight = options.height * scale;

		// Set canvas dimensions
		canvas.width = scaledWidth;
		canvas.height = scaledHeight;

		// Create temporary DOM element to render markdown
		const tempEl = this.renderContainer.createDiv({
			cls: 'long-view-page'
		});
		tempEl.style.width = `${options.width}px`;
		tempEl.style.height = `${options.height}px`;
		tempEl.style.background = '#ffffff';
		tempEl.style.overflow = 'hidden';
		tempEl.style.position = 'relative';

		const contentEl = tempEl.createDiv({ cls: 'long-view-page-content' });

		// Render markdown
		try {
			await MarkdownRenderer.render(
				this.app,
				markdown,
				contentEl,
				options.sourcePath,
				this
			);
		} catch (error) {
			console.error('CanvasPageRenderer: Error rendering markdown:', error);
			contentEl.setText(markdown);
		}

		// Wait for images to load
		const images = tempEl.querySelectorAll('img');
		await this.waitForImages(images);

		// Use html2canvas-like approach: draw DOM to canvas
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Could not get canvas context');
		}

		// Scale context for high DPI
		ctx.scale(scale, scale);

		// Draw the element to canvas
		await this.drawElementToCanvas(tempEl, ctx, options.width, options.height);

		// Clean up
		tempEl.remove();
	}

	/**
	 * Draw an HTML element to a canvas context
	 * This is a simplified version - for production you might want to use html2canvas library
	 */
	private async drawElementToCanvas(
		element: HTMLElement,
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number
	): Promise<void> {
		// For now, use a simpler approach with foreign object in SVG
		// This works in modern browsers
		const data = `
			<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
				<foreignObject width="100%" height="100%">
					<div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px;">
						${element.innerHTML}
					</div>
				</foreignObject>
			</svg>
		`;

		const img = new Image();
		const blob = new Blob([data], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);

		return new Promise((resolve, reject) => {
			img.onload = () => {
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, width, height);
				ctx.drawImage(img, 0, 0);
				URL.revokeObjectURL(url);
				resolve();
			};

			img.onerror = (error) => {
				URL.revokeObjectURL(url);
				console.error('CanvasPageRenderer: Error loading image:', error);
				// Fallback: draw white background
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, width, height);
				resolve();
			};

			// Timeout after 10 seconds
			setTimeout(() => {
				URL.revokeObjectURL(url);
				console.warn('CanvasPageRenderer: Timeout loading image');
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, width, height);
				resolve();
			}, 10000);

			img.src = url;
		});
	}

	/**
	 * Wait for all images to load
	 */
	private async waitForImages(images: NodeListOf<HTMLImageElement>): Promise<void> {
		const promises: Promise<void>[] = [];

		images.forEach((img) => {
			if (img.complete) {
				return;
			}

			promises.push(
				new Promise((resolve) => {
					img.onload = () => resolve();
					img.onerror = () => resolve();
					setTimeout(() => resolve(), 5000);
				})
			);
		});

		await Promise.all(promises);
	}
}
