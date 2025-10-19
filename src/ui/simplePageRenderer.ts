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
	// Extract message and determine color
	let message = flagText;
	let color = '#888888';
	let flagType = '';
	const fullLine = flagText.trim();

	if (message.startsWith('==')) {
		const match = message.match(/==(\w+):\s*([^=]+)==/);
		if (match) {
			flagType = match[1];
			message = match[2].trim();
			color = getFlagColor(flagType);
		}
	} else if (message.startsWith('%%')) {
		message = message.replace(/^%%\s*/, '').replace(/%%$/, '').trim();
		color = getFlagColor('COMMENT');
		flagType = 'COMMENT';
	}

	// Create a full-width bar
	const bar = containerEl.createDiv({ cls: 'long-view-flag-bar' });
	const flagTypeUpper = flagType.toUpperCase();
	if (flagTypeUpper === 'MISSING') {
		bar.addClass('is-missing-flag');
	} else {
		bar.style.backgroundColor = color;
	}

	// At low zoom, show just the bar without text for cleaner look, but make it taller
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
	const parts: Array<{ type: 'text' | 'flag'; content: string; flagType?: string; color?: string }> = [];

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

		// Determine flag type and color
		let flagType = '';
		let color = '#888888';

		if (match[0].startsWith('==')) {
			// ==TYPE: message ==
			flagType = match[2] || '';
			color = getFlagColor(flagType);
		} else {
			// %% comment %%
			flagType = 'COMMENT';
			color = '#888888';
		}

		// Add the flag
		parts.push({
			type: 'flag',
			content: match[0],
			flagType,
			color
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
		if (part.type === 'flag' && part.color) {
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
			const flagTypeUpper = part.flagType?.toUpperCase();
		if (flagTypeUpper === 'MISSING') {
			bar.addClass('is-missing-flag');
		} else {
			bar.style.backgroundColor = part.color;
		}

			// At low zoom, show just the bar without text for cleaner look, but make it taller
			if (zoomLevel >= 20) {
				if (flagTypeUpper === 'MISSING') {
					bar.setText(message);
				} else {
					bar.setText(message);
				}
			} else {
				bar.addClass('long-view-flag-bar-low-zoom');
			}
		}
	}
}

function getFlagColor(type: string): string {
	const typeUpper = type.toUpperCase();
	const colorMap: Record<string, string> = {
		'TODO': '#ffd700',      // Yellow
		'NOW': '#ff4444',       // Red
		'DONE': '#44ff44',      // Green
		'WAITING': '#ff9944',   // Orange
		'NOTE': '#4488ff',      // Blue
		'IMPORTANT': '#ff44ff', // Magenta
		'COMMENT': '#888888',   // Gray
		'MISSING': '#ff4444',   // Red (special handling)
	};
	return colorMap[typeUpper] || '#888888';
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
