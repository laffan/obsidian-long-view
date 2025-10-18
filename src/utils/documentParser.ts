export interface DocumentPage {
	content: string;
	wordCount: number;
	startOffset: number;
	endOffset: number;
	pageNumber: number;
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
