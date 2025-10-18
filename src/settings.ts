export interface LongViewSettings {
	fontSize: number;
	paddingVertical: number;
	paddingHorizontal: number;
	defaultZoom: number;
}

export const DEFAULT_SETTINGS: LongViewSettings = {
	fontSize: 25,
	paddingVertical: 250,
	paddingHorizontal: 200,
	defaultZoom: 15, // 15% zoom as default (5-30% range)
};

/**
 * Calculate how many words fit on a page based on font size and padding
 */
export function calculateWordsPerPage(
	fontSize: number,
	paddingVertical: number,
	paddingHorizontal: number
): number {
	const PAGE_WIDTH = 1275;
	const PAGE_HEIGHT = 1650;
	const LINE_HEIGHT_MULTIPLIER = 1.6;
	const AVG_CHAR_WIDTH_RATIO = 0.55; // Average character width relative to font size
	const AVG_WORD_LENGTH = 6; // 5 chars + 1 space

	// Calculate available text area
	const availableWidth = PAGE_WIDTH - (2 * paddingHorizontal);
	const availableHeight = PAGE_HEIGHT - (2 * paddingVertical);

	// Calculate characters per line
	const charWidth = fontSize * AVG_CHAR_WIDTH_RATIO;
	const charsPerLine = Math.floor(availableWidth / charWidth);

	// Calculate lines per page
	const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
	const linesPerPage = Math.floor(availableHeight / lineHeight);

	// Calculate total characters and words
	const totalChars = charsPerLine * linesPerPage;
	const wordsPerPage = Math.floor(totalChars / AVG_WORD_LENGTH);

	return Math.max(50, wordsPerPage); // Minimum 50 words per page
}
