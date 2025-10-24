const INLINE_FLAG_REGEX =
  /==[A-Za-z][A-Za-z0-9_-]{0,24}:\s*[^=]+==/g;
const BLOCK_COMMENT_REGEX = /%%[\s\S]*?%%/g;

function removeCalloutBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*>\s*\[!/.test(line)) {
      index += 1;
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        index += 1;
      }
      // skip optional trailing empty line immediately after callout block
      if (index < lines.length && lines[index].trim().length === 0) {
        index += 1;
      }
      continue;
    }
    result.push(line);
    index += 1;
  }

  return result.join("\n");
}

function collapseWhitespace(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

export function stripFlagsAndComments(markdown: string): string {
  if (!markdown) return "";
  let result = markdown.replace(BLOCK_COMMENT_REGEX, "");
  result = result.replace(INLINE_FLAG_REGEX, "");
  result = removeCalloutBlocks(result);
  result = collapseWhitespace(result);
  return result.trim();
}
