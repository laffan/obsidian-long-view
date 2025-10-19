import { DocumentPage, parseFlags, parseHeadingsWithCallouts } from './documentParser';

/**
 * Build minimap sections tailored for the minimap renderer.
 * Sections intentionally avoid word-count pagination so callout
 * backgrounds remain continuous across paragraphs.
 */
export function buildMinimapSections(text: string): DocumentPage[] {
	if (!text || text.trim().length === 0) {
		return [];
	}

	const headings = parseHeadingsWithCallouts(text, 0);
	const flags = parseFlags(text, 0);
	const wordCount = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;

	return [
		{
			content: text,
			wordCount,
			startOffset: 0,
			endOffset: text.length,
			pageNumber: 0,
			headings,
			flags,
		},
	];
}

