/**
 * Simple, fast renderer for paged view
 * Renders headings and basic text without full markdown processing
 */

import { App, TFile } from 'obsidian';
import { DocumentHeading } from '../utils/documentParser';

export function renderPageContent(
	content: string,
	containerEl: HTMLElement,
	zoomLevel: number = 15,
	app?: App,
	sourcePath?: string,
	headings?: DocumentHeading[],
	headingCalloutStacks?: Map<number, Array<{ color: string }>>
): void {
	const lines = content.split('\n');

	// Build a map of line positions to heading info and their callout stacks
	const headingMap = new Map<number, { heading: DocumentHeading; stack: Array<{ color: string }> }>();
	if (headings && headingCalloutStacks) {
		for (const heading of headings) {
			// Find which line this heading is on within the content
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim().startsWith('#') && lines[i].includes(heading.text)) {
					const stack = headingCalloutStacks.get(heading.startOffset) || [];
					headingMap.set(i, { heading, stack });
					break;
				}
			}
		}
	}

	// Helper to create wrapper structure for callout stack
	const createWrapperStructure = (stack: Array<{ color: string }>): HTMLElement => {
		let container = containerEl;
		for (const callout of stack) {
			const wrapper = container.createDiv({ cls: 'long-view-page-callout-bg' });
			// Use rgba with 0.15 alpha for semi-transparent background
			const rgbMatch = callout.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
			if (rgbMatch) {
				const [, r, g, b] = rgbMatch;
				wrapper.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
			} else {
				wrapper.style.backgroundColor = callout.color;
				wrapper.style.opacity = '0.15';
			}
			container = wrapper;
		}
		return container;
	};

	// Now render with wrapper divs
	let currentLine = 0;
	let currentCalloutStack: Array<{ color: string }> = [];
	let renderTarget = containerEl;

	for (const line of lines) {
		// Check if this line has a heading that changes the callout stack
		const headingInfo = headingMap.get(currentLine);
		if (headingInfo) {
			// Stack changed - create new wrapper structure
			const stackChanged = JSON.stringify(headingInfo.stack) !== JSON.stringify(currentCalloutStack);
			if (stackChanged) {
				currentCalloutStack = headingInfo.stack;
				renderTarget = createWrapperStructure(currentCalloutStack);
			}
		}

		const trimmed = line.trim();
		currentLine++;

		// Skip empty lines
		if (trimmed.length === 0) {
			continue;
		}

		// Check if line is a standalone flag
		const standaloneFlag = /^(==(\w+):[^=]+==|%%[^%]+%%)$/.test(trimmed);
		if (standaloneFlag) {
			// Render as bar at all zoom levels
			renderStandaloneFlag(trimmed, renderTarget, zoomLevel);
			continue;
		}

		// Check for headings
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const text = headingMatch[2];
			const tagName = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
			const headingEl = renderTarget.createEl(tagName);
			renderInlineFormatting(text, headingEl, renderTarget, zoomLevel);
			continue;
		}

		// Check for images
		const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)|^!\[\[([^|\]]+)(?:\|([^\]]*))?\]\]$/);
		if (imageMatch) {
			if (app && sourcePath) {
				renderImage(imageMatch, renderTarget, app, sourcePath);
			}
			continue;
		}

		// Render as paragraph with basic inline formatting
		const p = renderTarget.createEl('p');
		renderInlineFormatting(trimmed, p, renderTarget, zoomLevel);
	}
}

function renderStandaloneFlag(flagText: string, containerEl: HTMLElement, zoomLevel: number): void {
	let message = flagText;
	let flagType = 'COMMENT';
	const fullLine = flagText.trim();

	if (message.startsWith('==')) {
		const match = message.match(/==(\w+):\s*([^=]+)==/);
		if (match) {
			flagType = match[1].toUpperCase();
			message = match[2].trim();
		}
	} else if (message.startsWith('%%')) {
		message = message.replace(/^%%\s*/, '').replace(/%%$/, '').trim();
		flagType = 'COMMENT';
	}

	const bar = containerEl.createDiv({ cls: 'long-view-flag-bar' });
	const flagTypeUpper = flagType.toUpperCase();
	const flagTypeLower = flagTypeUpper.toLowerCase();
	bar.addClass(`long-view-flag-type-${flagTypeLower}`);
	bar.dataset.flagType = flagTypeLower;
	if (flagTypeUpper === 'MISSING') {
		bar.addClass('is-missing-flag');
	}

	if (zoomLevel >= 20) {
		if (flagTypeUpper === 'MISSING') {
			const cleaned = fullLine
				.replace(/^==/, '')
				.replace(/==$/, '')
				.trim();
			const withoutTitle = cleaned.replace(/^MISSING:\s*/i, '').trim();
			bar.setText(withoutTitle.length > 0 ? withoutTitle : message);
		} else {
			bar.setText(message);
		}
	} else {
		bar.addClass('long-view-flag-bar-low-zoom');
	}
}

function renderInlineFormatting(text: string, textContainerEl: HTMLElement, pageContainerEl: HTMLElement, zoomLevel: number): void {
	// Pattern to match flags and comments inline
	const flagPattern = /(==(\w+):[^=]+==|%%[^%]+%%)/g;
const parts: Array<{ type: 'text' | 'flag'; content: string; flagType?: string }> = [];

	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = flagPattern.exec(text)) !== null) {
		// Add text before the flag
		if (match.index > lastIndex) {
			parts.push({
				type: 'text',
				content: text.substring(lastIndex, match.index)
			});
		}

	// Determine flag type
	let flagType = '';

	if (match[0].startsWith('==')) {
		// ==TYPE: message ==
		flagType = match[2] || '';
	} else {
		// %% comment %%
		flagType = 'COMMENT';
	}

	// Add the flag
	parts.push({
		type: 'flag',
		content: match[0],
		flagType,
	});

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push({
			type: 'text',
			content: text.substring(lastIndex)
		});
	}

	// Render the parts
	// First, render just the text in the text container
	for (const part of parts) {
		if (part.type === 'text') {
			textContainerEl.appendText(part.content);
		}
	}

	// Then, add flag bars after the text element (at all zoom levels)
	for (const part of parts) {
	if (part.type === 'flag' && part.flagType) {
			// Extract the message from the flag
			let message = part.content;
			// Remove the markup to get clean message
			if (message.startsWith('==')) {
				message = message.replace(/^==\w+:\s*/, '').replace(/==$/, '').trim();
			} else if (message.startsWith('%%')) {
				message = message.replace(/^%%\s*/, '').replace(/%%$/, '').trim();
			}

			// Create a full-width bar in the page container (not inside the p/h tag)
			const bar = pageContainerEl.createDiv({ cls: 'long-view-flag-bar' });
			const flagTypeUpper = part.flagType?.toUpperCase() ?? 'COMMENT';
			const flagTypeLower = flagTypeUpper.toLowerCase();
			bar.addClass(`long-view-flag-type-${flagTypeLower}`);
			bar.dataset.flagType = flagTypeLower;
		if (flagTypeUpper === 'MISSING') {
			bar.addClass('is-missing-flag');
		}

			// At low zoom, show just the bar without text for cleaner look, but make it taller
			if (zoomLevel >= 20) {
				bar.setText(message);
			} else {
				bar.addClass('long-view-flag-bar-low-zoom');
			}
		}
	}
}

function renderImage(match: RegExpMatchArray, containerEl: HTMLElement, app: App, sourcePath: string): void {
	let link = '';
	let alt = '';

	if (match[2]) {
		// Markdown format: ![alt](link)
		alt = match[1] || '';
		link = parseMarkdownImageLink(match[2]);
	} else {
		// Wikilink format: ![[link|alt]]
		link = match[3]?.trim() ?? '';
		alt = (match[4] ?? '').trim() || link;
	}

	const src = resolveImageSrc(link, app, sourcePath);
	if (src) {
		const imgEl = containerEl.createEl('img');
		imgEl.src = src;
		imgEl.alt = alt || link;
	}
}

function parseMarkdownImageLink(spec: string): string {
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

function resolveImageSrc(link: string, app: App, sourcePath: string): string | null {
	let trimmed = link.trim();
	if (!trimmed) {
		return null;
	}

	if (/^(app:|https?:|data:)/i.test(trimmed)) {
		return trimmed;
	}

	const normalized = trimmed.replace(/\\/g, '/');
	const [pathPart] = normalized.split('#');
	const targetFile = app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
	if (targetFile instanceof TFile) {
		return app.vault.getResourcePath(targetFile);
	}

	// Attempt to resolve standard markdown links relative to vault root
	const fallbackFile = app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath);
	if (fallbackFile instanceof TFile) {
		return app.vault.getResourcePath(fallbackFile);
	}

	// Last resort: return encoded original link so external paths still render
	try {
		return encodeURI(trimmed);
	} catch (error) {
		console.warn('SimplePageRenderer: Failed to encode image link', trimmed, error);
		return trimmed;
	}
}
