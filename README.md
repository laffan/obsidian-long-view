# Long View – Obsidian Document Overview

Long View provides two complementary ways to visualize and navigate your markdown documents: a continuous **Minimap** for quick scanning, and a zoomable **Paged** view for a print-preview style overview.

## Two View Modes

### Minimap Mode
A continuous, scrollable overview of your entire document with:
- **Tiny text** – Paragraphs render as ~2px text for maximum density
- **Readable headings** – Auto-numbered (1, 1.1, 1.1.1...) at 12px, H1s underlined
- **Image thumbnails** – Embedded images appear as 100px thumbnails
- **Flag indicators** – Color-coded badges for TODO, NOW, and comment flags
- **Live sync** – Active heading highlights automatically as you scroll the editor
- **Click to jump** – Headings, images, and flags are clickable for instant navigation
- **Filters menu** – Compact dropdown to toggle Text, Numbers, Images, Comments, flip all line or section flags on/off at once, and fine-tune individual flag types (each entry shows a colored dot)

### Paged Mode
A zoomable grid of letter-size pages (450 words each) with:
- **Adjustable zoom** – Scale from 5% to 30% with live column reflow
- **Page numbers** – Upper-left corner, always visible at ~12px apparent size
- **Flag visualization** – At low zoom (<20%): colored bars across page tops. At high zoom (≥20%): full-width inline bars with message text
- **Fast rendering** – Simplified markdown parser for smooth performance
- **Click navigation** – Click any page or flag to jump the editor

## Line Flag System (Highlights)

Long View recognizes and visualizes task flags and comments:

- `==TODO: message ==` → Yellow
- `==NOW: message ==` → Red
- `==DONE: message ==` → Green
- `==WAITING: message ==` → Orange
- `==NOTE: message ==` → Blue
- `==IMPORTANT: message ==` → Magenta
- `%% comment %%` → Gray

Flags appear as clickable indicators in both modes, adapting their display to zoom level and view type.

**Tip:** You can provide a short label for minimap previews by inserting a pipe in the flag text. For example, `==TODO: Refactor intro | expand supporting evidence ==` shows **Refactor intro** in the minimap while keeping the full message everywhere else.

## Section Flag System (Callouts)

Long view can also add flags to whole sections of the document using the markdown heading structure. This tints the background of the section in both views.

Section flags now ship with the same flexibility as line flags:

- **SUMMARY** is a permanent section flag. It renders with a subtle gray background in the editor, shows in the filters list, and remains untinted inside the minimap.
- Add new callout types from the plugin settings and assign their colors; built-in callouts keep their Obsidian defaults.
- Minimap filters include master toggles for line vs. section flags plus per-type controls, so you can quickly hide or show entire categories.

To add a section flag, the line immediately following the heading in question must be an Obsidian callout. Coloring follows Obsidian's existing scheme, as described here: https://help.obsidian.md/callouts. In minimap mode, the callout title (but not the content block) appears at 0.5 opacity immediately below the heading.

## Using Long View

1. Open any markdown file in Obsidian.
2. Activate Long View via ribbon icon or command palette (`Long View: Open Long View`).
3. **Choose your mode**: Click "Minimap" for continuous overview, or "Paged" for print-style pages.
4. **Use Filters**: In Minimap, click "Filters" to expand a right-aligned toggle list for Text, Numbers, Images, Comments, all line flags, all section flags, and each detected flag type (entries include a colored dot).
5. **Navigate**: Click headings, images, or flags to jump the editor to that location.
6. **Refresh**: Click the ♻️ button to update the view with your latest edits.

**Note**: Long View does not auto-refresh on every keystroke for performance. Switch files, change modes, or click refresh to update.

## Implementation

| File | Responsibility |
| ---- | -------------- |
| `src/ui/LongView.ts` | View mode management, zoom controls, paged view rendering, and scroll coordination |
| `src/ui/miniMapRenderer.ts` | Minimap rendering: tokenizes documents into headings, text, images, and flags |
| `src/ui/simplePageRenderer.ts` | Fast text-only renderer for paged view with flag bar support |
| `src/utils/simplePagination.ts` | Splits documents into 450-word pages with heading and flag extraction |
| `src/utils/documentParser.ts` | Flag parsing and color mapping for TODO/NOW/comments |
| `styles.css` | Visual presentation for both modes, flag styling, and responsive zoom layouts |

## Building & Installing

```bash
npm install
npm run build
```

Copy the plugin folder (with `main.js`, `manifest.json`, and `styles.css`) into your vault's `.obsidian/plugins` directory, reload Obsidian, then enable **Long View** from Settings → Community Plugins.

## Tips & Troubleshooting

- **View not updating?** Click the ♻️ refresh button to manually update with your latest edits.
- **Images missing in minimap?** Ensure linked files exist in your vault or use full URLs. Long View resolves standard markdown, wikilinks, and remote URLs.
- **Flags not showing?** Verify syntax: `==TYPE: message ==` with spaces after colon and before closing `==`. Comments use `%% message %%`.
- **Page overflow in paged mode?** Try adjusting zoom level (5-30%) to fit more/fewer columns.
- **Performance issues?** Long View updates only when switching files, modes, or clicking refresh—not on every keystroke.

## License

MIT
