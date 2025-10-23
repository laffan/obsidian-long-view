import { getFlagColor } from "../flags/flagColors";

export interface DocumentCallout {
  type: string;
  title: string;
  color: string;
  startOffset: number;
}

export interface DocumentHeading {
  level: number;
  text: string;
  startOffset: number;
  callout?: DocumentCallout;
}

export interface DocumentFlag {
  type: string;
  message: string;
  startOffset: number;
  color: string;
  lineText: string;
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
 * Parse headings within the provided content and capture callout metadata
 * relative to the supplied startOffset.
 */
export function parseHeadingsWithCallouts(
  content: string,
  startOffset = 0,
): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  const headingPattern = /^#{1,6}\s+.+$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(content)) !== null) {
    const level = match[0].match(/^#+/)?.[0].length ?? 1;
    const text = match[0].replace(/^#{1,6}\s*/, "").trim();
    const headingOffset = startOffset + match.index;

    // Look ahead to see whether the next non-empty line is a callout
    const afterHeading = content.substring(match.index + match[0].length);
    const nextLineMatch = afterHeading.match(/^\n*([^\n]*)/);
    let callout: DocumentCallout | undefined = undefined;

    if (nextLineMatch && nextLineMatch[1].trim()) {
      const nextLine = nextLineMatch[1].trim();
      if (nextLine.startsWith("> [!")) {
        const parsedCallout = parseCallout(nextLine, headingOffset);
        if (parsedCallout) {
          callout = parsedCallout;
        }
      }
    }

    headings.push({
      level,
      text,
      startOffset: headingOffset,
      callout,
    });
  }

  return headings;
}

/**
 * Parse document text into pages of approximately wordsPerPage words
 * Preserves original text structure including line breaks and formatting
 */
export function parseDocumentIntoPages(
  text: string,
  wordsPerPage: number,
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
  return textUpToOffset.split("\n").length - 1;
}

/**
 * Parse flags from content
 * Format: ==TYPE: message == and %% comment %%
 */
export function parseFlags(
  content: string,
  baseOffset: number,
): DocumentFlag[] {
  const flags: DocumentFlag[] = [];

  // Match ==TYPE: message == (TYPE allows letters, numbers, hyphen, underscore; starts with letter)
  const flagPattern = /==([A-Za-z][A-Za-z0-9_-]{1,24}):\s*([^=]+)==/g;
  let match: RegExpExecArray | null;

  while ((match = flagPattern.exec(content)) !== null) {
    const type = match[1];
    const message = match[2].trim();
    const startOffset = baseOffset + match.index;
    const color = getFlagColor(type);
    const startOfLine = content.lastIndexOf("\n", match.index);
    const endOfLine = content.indexOf("\n", match.index + match[0].length);
    const lineText = content
      .substring(
        startOfLine === -1 ? 0 : startOfLine + 1,
        endOfLine === -1 ? content.length : endOfLine,
      )
      .trim();

    flags.push({
      type,
      message,
      startOffset,
      color,
      lineText,
    });
  }

  // Match %% comment %%
  const commentPattern = /%%([^%]+)%%/g;
  while ((match = commentPattern.exec(content)) !== null) {
    const message = match[1].trim();
    const startOffset = baseOffset + match.index;
    const color = getFlagColor("COMMENT");
    const startOfLine = content.lastIndexOf("\n", match.index);
    const endOfLine = content.indexOf("\n", match.index + match[0].length);
    const lineText = content
      .substring(
        startOfLine === -1 ? 0 : startOfLine + 1,
        endOfLine === -1 ? content.length : endOfLine,
      )
      .trim();

    flags.push({
      type: "COMMENT",
      message,
      startOffset,
      color,
      lineText,
    });
  }

  return flags;
}

/**
 * Get first N words from a message
 */
export function getFirstWords(message: string, wordCount: number): string {
  const words = message.trim().split(/\s+/);
  return (
    words.slice(0, wordCount).join(" ") +
    (words.length > wordCount ? "..." : "")
  );
}

/**
 * Map callout type to RGB color
 * Based on Obsidian's default callout color scheme
 */
export function getCalloutColor(type: string): string {
  const typeLower = type.toLowerCase();
  const colorMap: Record<string, string> = {
    bug: "rgb(233, 49, 71)",
    default: "rgb(8, 109, 221)",
    error: "rgb(233, 49, 71)",
    fail: "rgb(233, 49, 71)",
    example: "rgb(120, 82, 238)",
    important: "rgb(0, 191, 188)",
    info: "rgb(8, 109, 221)",
    question: "rgb(236, 117, 0)",
    help: "rgb(236, 117, 0)",
    faq: "rgb(236, 117, 0)",
    success: "rgb(8, 185, 78)",
    check: "rgb(8, 185, 78)",
    done: "rgb(8, 185, 78)",
    summary: "rgb(0, 191, 188)",
    abstract: "rgb(0, 191, 188)",
    tldr: "rgb(0, 191, 188)",
    tip: "rgb(0, 191, 188)",
    hint: "rgb(0, 191, 188)",
    todo: "rgb(8, 109, 221)",
    warning: "rgb(236, 117, 0)",
    caution: "rgb(236, 117, 0)",
    attention: "rgb(236, 117, 0)",
    danger: "rgb(233, 49, 71)",
    note: "rgb(8, 109, 221)",
    quote: "rgb(120, 82, 238)",
    cite: "rgb(120, 82, 238)",
  };
  return colorMap[typeLower] || "rgb(8, 109, 221)"; // Default to blue
}

/**
 * Parse callout from text starting at a given position
 * Returns callout info if found, null otherwise
 * Format: > [!type] Title
 */
export function parseCallout(
  text: string,
  startOffset: number,
): DocumentCallout | null {
  // Match callout syntax: > [!type] optional title
  // The callout can have + or - for foldable, which we ignore
  const calloutPattern = /^>\s*\[!([^\]]+)\]([+-]?)\s*(.*)$/m;
  const match = text.match(calloutPattern);

  if (!match) {
    return null;
  }

  const type = match[1].trim();
  const title = match[3].trim() || type.charAt(0).toUpperCase() + type.slice(1); // Default title is capitalized type
  const color = getCalloutColor(type);

  return {
    type,
    title,
    color,
    startOffset,
  };
}

/**
 * Compute callout stacks for all headings in document pages
 * Returns a map from heading offset to its active callout stack
 */
export function computeHeadingCalloutStacks(
  pages: DocumentPage[],
): Map<number, Array<{ color: string }>> {
  const stackMap = new Map<number, Array<{ color: string }>>();
  const calloutStack: Array<{ level: number; color: string }> = [];

  // Process all headings in document order
  for (const page of pages) {
    if (!page.headings) continue;

    for (const heading of page.headings) {
      // Remove callouts from stack at same or higher level
      const newStack = calloutStack.filter((c) => c.level < heading.level);
      calloutStack.length = 0;
      calloutStack.push(...newStack);

      // Add this heading's callout if present
      if (heading.callout) {
        calloutStack.push({
          level: heading.level,
          color: heading.callout.color,
        });
      }

      // Store the current stack for this heading (copy it)
      stackMap.set(
        heading.startOffset,
        calloutStack.map((c) => ({ color: c.color })),
      );
    }
  }

  return stackMap;
}
