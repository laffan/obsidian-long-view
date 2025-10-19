/**
 * Simple, fast renderer for paged view
 * Renders headings and basic text without full markdown processing
 */

export function renderPageContent(content: string, containerEl: HTMLElement, zoomLevel: number = 15): void {
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines
		if (trimmed.length === 0) {
			continue;
		}

		// Check if line is a standalone flag
		const standaloneFlag = /^(==(\w+):[^=]+==|%%[^%]+%%)$/.test(trimmed);
		if (standaloneFlag) {
			// At high zoom, render as bar; at low zoom, skip (rendered as badge)
			if (zoomLevel >= 20) {
				renderStandaloneFlag(trimmed, containerEl);
			}
			continue;
		}

		// Check for headings
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const text = headingMatch[2];
			const tagName = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
			const headingEl = containerEl.createEl(tagName);
			renderInlineFormatting(text, headingEl, containerEl, zoomLevel);
			continue;
		}

		// Check for images - skip them for performance
		if (/^!\[/.test(trimmed)) {
			continue;
		}

		// Render as paragraph with basic inline formatting
		const p = containerEl.createEl('p');
		renderInlineFormatting(trimmed, p, containerEl, zoomLevel);
	}
}

function renderStandaloneFlag(flagText: string, containerEl: HTMLElement): void {
	// Extract message and determine color
	let message = flagText;
	let color = '#888888';

	if (message.startsWith('==')) {
		const match = message.match(/==(\w+):\s*([^=]+)==/);
		if (match) {
			const type = match[1];
			message = match[2].trim();
			color = getFlagColor(type);
		}
	} else if (message.startsWith('%%')) {
		message = message.replace(/^%%\s*/, '').replace(/%%$/, '').trim();
		color = getFlagColor('COMMENT');
	}

	// Create a full-width bar
	const bar = containerEl.createDiv({ cls: 'long-view-flag-bar' });
	bar.style.backgroundColor = color;
	bar.setText(message);
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
	// At high zoom (>= 20%), show flags as full-width bars
	// At low zoom (< 20%), don't render inline (they're shown as badges)
	const showInlineBars = zoomLevel >= 20;

	// First, render just the text in the text container
	for (const part of parts) {
		if (part.type === 'text') {
			textContainerEl.appendText(part.content);
		}
	}

	// Then, if we're at high zoom, add flag bars after the text element
	if (showInlineBars) {
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
				bar.style.backgroundColor = part.color;
				bar.setText(message);
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
	};
	return colorMap[typeUpper] || '#888888';
}
