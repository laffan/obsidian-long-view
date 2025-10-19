import { DocumentHeading, DocumentPage } from './documentParser';

/**
 * Simple, fast pagination: 500 words base, reduced for images
 * No measuring, no complexity - just works
 */

export function paginateDocument(text: string): DocumentPage[] {
	if (!text || text.trim().length === 0) {
		return [];
	}

	const BASE_WORDS = 500; // Base words per page
	const WORDS_PER_IMAGE = 100; // Reduce by this much per image

	const pages: DocumentPage[] = [];

	// Get all words with their positions
	const wordPattern = /\S+/g;
	const wordMatches = Array.from(text.matchAll(wordPattern));

	if (wordMatches.length === 0) {
		return [];
	}

	let currentWordIndex = 0;
	let pageNumber = 0;

	while (currentWordIndex < wordMatches.length) {
		// Look ahead to detect images
		const lookAheadEnd = Math.min(currentWordIndex + BASE_WORDS, wordMatches.length);
		const lookAheadStart = wordMatches[currentWordIndex].index!;
		const lookAheadEndPos = lookAheadEnd < wordMatches.length
			? wordMatches[lookAheadEnd].index!
			: text.length;
		const lookAheadText = text.substring(lookAheadStart, lookAheadEndPos);

		// Count images (markdown format: ![alt](url))
		const imageMatches = lookAheadText.match(/!\[.*?\]\(.*?\)/g);
		const imageCount = imageMatches ? imageMatches.length : 0;

		// Adjust word count based on images
		const wordsThisPage = Math.max(
			50, // Minimum 50 words
			BASE_WORDS - (imageCount * WORDS_PER_IMAGE)
		);

		// Get the actual words for this page
		const endWordIndex = Math.min(
			currentWordIndex + wordsThisPage,
			wordMatches.length
		);

		const firstWord = wordMatches[currentWordIndex];
		const lastWord = wordMatches[endWordIndex - 1];
		const startOffset = firstWord.index!;
		const endOffset = lastWord.index! + lastWord[0].length;
		const content = text.substring(startOffset, endOffset);

		const headings = collectHeadings(content, startOffset);

		pages.push({
			content,
			wordCount: endWordIndex - currentWordIndex,
			startOffset,
			endOffset,
			pageNumber: pageNumber++,
			headings,
		});

		currentWordIndex = endWordIndex;

		// Safety check
		if (pageNumber > 10000) {
			console.warn('Pagination: Exceeded 10,000 pages');
			break;
		}
	}

	return pages;
}

function collectHeadings(content: string, startOffset: number): DocumentHeading[] {
	const headings: DocumentHeading[] = [];
	const headingPattern = /^#{1,6}\s+.+$/gm;
	let match: RegExpExecArray | null;

	while ((match = headingPattern.exec(content)) !== null) {
		const level = match[0].match(/^#+/)?.[0].length ?? 1;
		const text = match[0].replace(/^#{1,6}\s*/, '').trim();
		headings.push({
			level,
			text,
			startOffset: startOffset + match.index,
		});
	}

	return headings;
}
