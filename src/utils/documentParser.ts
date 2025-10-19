export interface DocumentHeading {
	level: number;
	text: string;
	startOffset: number;
}

export interface DocumentFlag {
	type: string;
	message: string;
	startOffset: number;
	color: string;
}

export interface DocumentPage {
	content: string;
	wordCount: number;
	startOffset: number;
	endOffset: number;
	pageNumber: number;
	headings?: DocumentHeading[];
	flags?: DocumentFlag[];
}

/**
 * Parse document text into pages of approximately wordsPerPage words
 * Preserves original text structure including line breaks and formatting
 */
export function parseDocumentIntoPages(
	text: string,
	wordsPerPage: number
): DocumentPage[] {
	if (!text || text.trim().length === 0) {
		return [];
	}

	const pages: DocumentPage[] = [];
	let pageNumber = 0;

	// Find all word boundaries in the text while preserving original structure
	// A word is defined as a sequence of non-whitespace characters
	const wordPattern = /\S+/g;
	const wordMatches = Array.from(text.matchAll(wordPattern));

	if (wordMatches.length === 0) {
		return [];
	}

	// Split into pages based on word count
	for (let i = 0; i < wordMatches.length; i += wordsPerPage) {
		const pageWordMatches = wordMatches.slice(i, i + wordsPerPage);
		const firstWord = pageWordMatches[0];
		const lastWord = pageWordMatches[pageWordMatches.length - 1];

		// Extract the substring from the original text, preserving all formatting
		const startOffset = firstWord.index!;
		const endOffset = lastWord.index! + lastWord[0].length;
		const content = text.substring(startOffset, endOffset);

		pages.push({
			content,
			wordCount: pageWordMatches.length,
			startOffset,
			endOffset,
			pageNumber: pageNumber++,
		});
	}

	return pages;
}

/**
 * Get the line number from a character offset in the text
 */
export function getLineFromOffset(text: string, offset: number): number {
	const textUpToOffset = text.substring(0, offset);
	return textUpToOffset.split('\n').length - 1;
}

/**
 * Map flag type to color
 */
export function getFlagColor(type: string): string {
	const typeUpper = type.toUpperCase();
	const colorMap: Record<string, string> = {
		'TODO': '#ffd700',      // Yellow
		'NOW': '#ff4444',       // Red
		'DONE': '#44ff44',      // Green
		'WAITING': '#ff9944',   // Orange
		'NOTE': '#4488ff',      // Blue
		'IMPORTANT': '#ff44ff', // Magenta
		'COMMENT': '#888888',   // Gray (for %% comments %%)
	};
	return colorMap[typeUpper] || '#888888'; // Default gray
}

/**
 * Parse flags from content
 * Format: ==TYPE: message == and %% comment %%
 */
export function parseFlags(content: string, baseOffset: number): DocumentFlag[] {
	const flags: DocumentFlag[] = [];

	// Match ==TYPE: message ==
	const flagPattern = /==(\w+):\s*([^=]+)==/g;
	let match: RegExpExecArray | null;

	while ((match = flagPattern.exec(content)) !== null) {
		const type = match[1];
		const message = match[2].trim();
		const startOffset = baseOffset + match.index;
		const color = getFlagColor(type);

		flags.push({
			type,
			message,
			startOffset,
			color,
		});
	}

	// Match %% comment %%
	const commentPattern = /%%([^%]+)%%/g;
	while ((match = commentPattern.exec(content)) !== null) {
		const message = match[1].trim();
		const startOffset = baseOffset + match.index;
		const color = getFlagColor('COMMENT');

		flags.push({
			type: 'COMMENT',
			message,
			startOffset,
			color,
		});
	}

	return flags;
}

/**
 * Get first N words from a message
 */
export function getFirstWords(message: string, wordCount: number): string {
	const words = message.trim().split(/\s+/);
	return words.slice(0, wordCount).join(' ') + (words.length > wordCount ? '...' : '');
}
