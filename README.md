# Long View – Obsidian Minimap & Outline

Long View gives you a dedicated pane that acts like a hybrid between a code minimap and a markdown outline. Instead of paging through large thumbnails, you get a continuous, clickable overview of the entire note that stays in sync with the active editor.

## What You See

- **Document minimap** – Every paragraph renders as tiny text while headings stay readable, numbered (1, 1.1, 1.1.1 …), and occupy the full available width.
- **Live outline** – The heading that matches your current scroll position is highlighted automatically.
- **Embedded media** – Markdown images (standard links or wikilinks) show up as scaled thumbnails right inside the minimap stream.
- **Accurate navigation** – Clicking a heading, image, or paragraph jumps the main editor so the relevant heading lands at the top of the viewport.

## Core Features

- ✅ Continuous minimap instead of page thumbnails.
- ✅ Auto-numbered headings with configurable styling (H1 underlined, all headings at 12 px).
- ✅ Tiny body text (5 % scale → ~2 px font) capped to a 100 px column for readability.
- ✅ Image resolution that understands Obsidian vault paths, wikilinks, and external URLs.
- ✅ Bi-directional sync between the minimap and the active markdown editor.
- ✅ Works with both Live Preview and Reading modes.

## Using Long View

1. Open any markdown file in Obsidian.
2. Activate the Long View pane via the ribbon icon or the command palette (`Long View: Open Long View`).
3. Scroll: the minimap highlights the heading that matches your editor’s viewport.
4. Click any heading, paragraph, or image in the minimap to jump the editor—Long View keeps the heading aligned at the top of the window.

The minimap refreshes automatically when you edit the note or switch files.

## Implementation Snapshot

| File | Responsibility |
| ---- | -------------- |
| `src/ui/LongView.ts` | Manages the workspace pane, keeps the minimap in sync with the active editor, and handles click / scroll coordination. |
| `src/ui/miniMapRenderer.ts` | Tokenises the document into headings, text fragments, and images; renders the minimap; resolves image sources; tracks active headings. |
| `src/utils/simplePagination.ts` | Creates lightweight “sections” so the minimap can chunk content without measuring full layouts. |
| `styles.css` | Defines the minimap presentation (heading sizes, paragraph column width, image thumbnails, highlight state). |

Older components (`virtualScroller`, `canvasRenderer`, adaptive pagination, etc.) are retained for reference but the current experience is powered by the files above.

## Building & Installing

```bash
npm install
npm run build
```

Copy the plugin folder (with `main.js`, `manifest.json`, and `styles.css`) into your vault’s `.obsidian/plugins` directory, reload Obsidian, then enable **Long View** from Settings → Community Plugins.

## Tips & Troubleshooting

- **Images missing?** Ensure the linked file exists in your vault or use a full URL. Long View resolves standard markdown links, wikilinks, and remote URLs.
- **Scroll feels off?** Long View will fall back to proportional scrolling if the editor API can’t expose the viewport; focusing the editor usually restores precise alignment.
- **Still want thumbnails?** The legacy grid code is still in the repo—you can branch from earlier commits if you prefer that layout.

## License

MIT
