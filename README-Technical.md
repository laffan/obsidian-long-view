# Long View Plugin – Technical Architecture

This document describes the internal architecture and implementation details of the Long View plugin for developers working on or extending this codebase.

## Architecture Overview

Long View is a document visualization plugin that renders markdown files in two complementary views: a continuous **Minimap** and a zoomable **Paged** view. The plugin is organized into modular layers:

1. **Plugin Lifecycle** (`src/main.ts`) – Initialization, settings, and command registration
2. **View Management** (`src/ui/LongView.ts`) – Single view container managing mode switching
3. **Rendering Engines** (`src/ui/miniMapRenderer.ts`, `src/ui/simplePageRenderer.ts`) – View-specific rendering
4. **Document Parsing** (`src/utils/documentParser.ts`, `src/utils/minimapParser.ts`) – Text tokenization and metadata extraction
5. **Flag System** (`src/flags/flagColors.ts`, `src/flags/flagStyling.ts`) – Flag detection, coloring, and inline highlighting
6. **Settings & Configuration** (`src/settings.ts`, `src/settingsTab.ts`) – User preferences and defaults

---

## Core Modules

### Plugin Lifecycle: `src/main.ts`

**Responsibility:** Plugin initialization, settings management, view registration, and command definition.

**Key Features:**
- Loads user settings with fallback to defaults, merging custom flag colors
- Registers the custom `LongView` view type with Obsidian
- Adds ribbon icon and commands (Open, Copy without flags in text/HTML format)
- Manages flag styling dynamically based on user color configuration
- Handles markdown post-processing to highlight inline flags in the editor

**Key Functions:**
- `onload()` – Initializes settings, flag styles, view registration, commands, and extensions
- `onunload()` – Cleans up the custom view, event listeners, and styling elements
- `activateView()` – Creates or reveals the Long View panel
- `applyFlagStyles()` – Generates and injects CSS for dynamic flag colors
- `copyStrippedContent()` – Implements copy commands; strips flags and comments before exporting

**Settings Lifecycle:**
- Settings are loaded, merged with defaults, and normalized on plugin init
- Custom flag colors are synchronized between settings, color maps, and the CSS generator
- `saveSettings()` persists changes to Obsidian's data storage

---

### View Management: `src/ui/LongView.ts`

**Responsibility:** Main view container that hosts both minimap and paged rendering modes.

**Key Concepts:**
- Extends Obsidian's `ItemView` class and registers as type `"long-view"`
- Manages two rendering modes: `"minimap"` (continuous scroll) and `"paged"` (grid of pages)
- Maintains state for zoom level, active file, current mode, and linked editor
- Synchronizes scroll position between minimap and editor

**Key Elements:**
- **Header Controls:**
  - Mode toggle buttons (Minimap / Paged)
  - Refresh button to manually update view
  - Zoom slider (5–30%, paged mode only)
  - Filters dropdown (minimap only) for toggling visibility of text, images, comments, flags, and individual flag types

- **Content Container:** Holds the rendered view (minimap or paged)

- **Filter Panel:** Allows fine-grained toggling of minimap rendering options

**Key Methods:**
- `onOpen()` – Builds the UI header with buttons, controls, and initializes the appropriate renderer
- `updateView()` – Fetches active editor content and re-renders
- `updateActiveHeading()` – Highlights the heading corresponding to the editor's current scroll position
- `onFileOpen()` – Updates view when switching files
- `switchMode(mode)` – Switches between minimap and paged rendering
- `setZoom(level)` – Adjusts zoom percentage in paged mode with live reflow

**Linking to Editor:**
- The view attempts to link to the currently active editor via `linkedLeafId`
- When an editor is detected, content is pulled from its text buffer
- Scroll events from the editor trigger heading highlight updates in the minimap

---

### Minimap Rendering: `src/ui/miniMapRenderer.ts`

**Responsibility:** Render the continuous minimap view with headings, text, images, and flags.

**Design Principles:**
- Tokenizes document into structural elements (headings, paragraphs, images, flags)
- Renders headings at 12px with auto-numbering (e.g., 1, 1.1, 1.1.1)
- Renders body text at ~3px for density
- Highlights current editor scroll position with a colored bar
- Supports clickable navigation via headings, images, and flags

**Key Classes:**

**`MiniMapRenderer` (extends `Component`):**
- Constructor accepts a `MiniMapOptions` object with:
  - `app`: Obsidian App instance
  - `containerEl`: DOM element to render into
  - `sourcePath`: File path for resolving images and links
  - `onHeadingClick`, `onSectionClick`: Callbacks for navigation
  - `minimapFonts`: Font sizes for body, heading, and flag text
  - `minimapLineGap`: Space between rendered lines
  - `includeComments`, `includeImages`: Feature toggles
  - `includeFlagTypes`: Show flag type labels alongside messages
  - `hiddenFlags`, `hiddenSectionFlags`: Sets of flag types to hide

- **Rendering Flow:**
  1. Parse headings and flags from document text
  2. Build a numbering system (e.g., H1, H1.1, H1.1.1)
  3. Iterate through document, rendering:
     - Headings (with underlines for H1, indentation for nesting)
     - Collapsed paragraphs (tiny text)
     - Image thumbnails (resolved from vault or external URLs)
     - Inline flags (TODO, MISSING, comments, etc.)
     - Section callout backgrounds tinting entire regions

- **Callout Stack Tracking:**
  - Maintains a stack of active callout types as headings are encountered
  - Each heading updates the stack based on the callout below it
  - Callout backgrounds are applied as wrappers in the DOM, creating nested tinted regions

- **Position Tracking:**
  - Stores all heading offsets in `headingEntries`
  - Maps editor scroll position to nearest heading
  - Highlights active heading with a colored bar

**Key Methods:**
- `render(pages, minimapSections)` – Main entry point; renders pages with minimap structure
- `buildSection()` – Renders a document section (typically the whole document)
- `renderHeading()` – Outputs heading with proper numbering, size, and styling
- `renderText()` – Renders paragraph text at tiny scale
- `renderImage()` – Resolves and renders image thumbnail
- `renderFlag()` – Outputs flag with color, type label (optional), and message preview
- `updateActiveHeading(editorScrollEl)` – Highlights heading matching editor scroll position
- `getHeadingFromOffset()` – Finds nearest heading given a text offset

**Callout Rendering:**
- Callouts are detected following headings in the markdown
- Callout type determines background tint color
- Backgrounds nest as new sections begin
- In minimap, only the callout title renders (at 0.5 opacity), not the full content

---

### Paged Rendering: `src/ui/simplePageRenderer.ts`

**Responsibility:** Render a zoomable grid of letter-size pages (450 words each).

**Design Principles:**
- Each page is approximately 450 words
- Page numbers appear in the upper-left corner at constant apparent size (12px)
- Headings and text are rendered as simple HTML (not full markdown)
- Flag bars adapt their display based on zoom level:
  - At zoom < 20%: Thin colored bars across page tops
  - At zoom ≥ 20%: Full-width inline bars with message text
- Multi-column layout reflows based on zoom percentage and viewport width

**Key Function:**

**`renderPageContent(content, containerEl, zoomLevel, app, sourcePath, headings, headingCalloutStacks)`:**
- Splits content into lines
- Maps headings to their line numbers for callout stack tracking
- Creates nested wrapper divs for each callout region
- Renders each line as a heading, flag bar, or text paragraph
- Applies CSS classes for zoom-dependent styling

**Zoom-Dependent Behavior:**
- Canvas or simple DOM-based rendering is selected based on performance and zoom level
- Zoom level is passed to CSS for media queries or JavaScript calculations
- At low zoom, flag bars are minimized; at high zoom, they expand with text

**Callout Regions:**
- Similar to minimap, paged view nests callout background wrappers
- Ensures callout tints span entire sections consistently

---

### Document Parsing: `src/utils/documentParser.ts`

**Responsibility:** Extract headings, flags, callouts, and pagination metadata from markdown text.

**Data Structures:**

```typescript
// Heading with optional attached callout
interface DocumentHeading {
  level: number;        // 1-6 for H1-H6
  text: string;         // Heading text content
  startOffset: number;  // Character offset in document
  callout?: DocumentCallout;
}

// Callout (section flag) following a heading
interface DocumentCallout {
  type: string;        // e.g., "NOTE", "SUMMARY", "DANGER"
  title: string;       // Full callout line
  color: string;       // CSS color for background tinting
  startOffset: number;
}

// Inline flag or comment
interface DocumentFlag {
  type: string;        // e.g., "TODO", "MISSING", "COMMENT"
  message: string;     // User message (or preview up to first pipe)
  startOffset: number;
  color: string;       // CSS color
  lineText: string;    // Full line containing the flag
}

// A paginated section of the document
interface DocumentPage {
  content: string;     // Raw text of the page
  wordCount: number;
  startOffset: number; // Character offset in original document
  endOffset: number;
  pageNumber: number;
  headings?: DocumentHeading[];
  flags?: DocumentFlag[];
}
```

**Key Functions:**

- **`parseHeadingsWithCallouts(content, startOffset)`** – Regex-based extraction of all headings (H1–H6) and detection of following callout lines (e.g., `> [!NOTE]`)

- **`parseFlags(content, startOffset)`** – Regex-based detection of:
  - Line flags: `==TYPE: message ==`
  - Comments: `%% message %%`
  - Supports optional pipe syntax: `==TYPE: short | long message ==` (minimap shows short, elsewhere shows long)

- **`parseDocumentIntoPages(text, wordsPerPage)`** – Splits document into pages while preserving paragraph structure. Default: 450 words/page.

- **`computeHeadingCalloutStacks(content, headings)`** – Builds a map from heading offsets to their callout stacks (ancestors that remain open)

**Flag Regex Patterns:**
- Line flags: `/==(\w+):\s*(.*?)\s*==/g`
- Comments: `/%%(.*?)%%/g`
- Handles uppercase conversion and color lookup

---

### Minimap Parsing: `src/utils/minimapParser.ts`

**Responsibility:** Prepare document data for minimap rendering without word-count pagination.

**Key Function:**

- **`buildMinimapSections(text)`** – Converts a document into a single `DocumentPage` containing headings, flags, and metadata. Unlike `parseDocumentIntoPages`, this avoids pagination to keep callout backgrounds continuous across the entire document.

---

### Flag System

#### `src/flags/flagColors.ts`

**Responsibility:** Centralized color lookup for inline flags (TODO, MISSING, etc.).

**Functions:**
- `setFlagColorMap(colorMap)` – Stores the global flag color mapping
- `getFlagColor(flagType)` – Retrieves color for a flag type, with fallback to default

**Default Flag Colors:**
```
TODO      → #ffd700 (gold)
COMMENT   → #888888 (gray)
MISSING   → #ff4444 (red)
REWRITE   → #ff66aa (pink)
RESEARCH  → #66aaff (light blue)
```

#### `src/flags/sectionFlagColors.ts`

**Responsibility:** Color lookup for section flags (callouts like NOTE, WARNING, etc.).

**Functions:**
- `setSectionFlagColorMap(colorMap)` – Stores the global section flag color mapping
- `getSectionFlagColor(calloutType)` – Retrieves color for a callout type

**Default Callout Colors:**
```
SUMMARY   → #b8b8b8 (gray)
NOTE      → #086ddd (blue)
WARNING   → #ec7500 (orange)
DANGER    → #e93147 (red)
SUCCESS   → #08b94e (green)
... and many more from Obsidian's callout scheme
```

#### `src/flags/flagStyling.ts`

**Responsibility:** Register editor extensions and markdown post-processors for inline flag highlighting.

**Functions:**
- `createFlagHighlightExtension()` – Returns a CodeMirror extension that highlights `==` and `%%` patterns in the code editor

- `processRenderedFlags(element, context)` – Post-processor that wraps flag patterns in the rendered preview with highlight classes

**Effect:** Flags appear highlighted in the editor and preview, consistent with minimap colors.

---

### Settings & Configuration

#### `src/settings.ts`

**Data Interfaces:**

```typescript
interface LongViewSettings {
  defaultZoom: number;                    // Default zoom % for paged mode
  viewMode: "minimap" | "paged";         // Initial view mode
  showParagraphsInMinimap: boolean;       // Render body text
  numberSections: boolean;                // Auto-number headings
  includeCommentsInMinimap: boolean;      // Show %% comments %%
  includeImagesInMinimap: boolean;        // Render image thumbnails
  showFlagTypesInMinimap: boolean;        // Show "TODO", "MISSING" labels
  minimapHiddenFlags: string[];           // Flags to hide in minimap
  minimapHiddenSectionFlags: string[];    // Section flags to hide
  flagColors: FlagColorMap;               // { TYPENAME: "#hexcolor", ... }
  customFlags: CustomFlag[];              // User-defined flags
  sectionFlagColors: SectionFlagColorMap; // { TYPENAME: "#hexcolor", ... }
  customSectionFlags: CustomFlag[];       // User-defined callout types
  minimapFontSizes: {
    body: number;      // px, typically 3
    heading: number;   // px, typically 12
    flag: number;      // px, typically 12
  };
  minimapLineGap: number;                 // px spacing between rendered lines
  currentPositionColor: string;           // Color for editor position highlight
}
```

**Defaults:**
- View mode: minimap
- Show paragraphs, comments, images, section numbering: all enabled
- Flag type labels: disabled
- No hidden flags by default
- Zoom: 15% (center of 5–30% range)

#### `src/settingsTab.ts`

**Responsibility:** Obsidian settings UI tab for user configuration.

**Sections:**
- **View Preferences:** Default zoom, default view mode, toggle paragraphs/images/comments
- **Minimap Settings:** Font sizes, line gap, position highlight color, show flag type labels
- **Flag Management:**
  - Inline flag colors (TODO, MISSING, custom) with color pickers
  - Custom flag CRUD (add/remove user-defined flag types)
- **Section Flags:**
  - Callout colors with color pickers
  - Custom section flag CRUD
- **Filters:**
  - Hide/show specific flag types in minimap
  - Hide/show specific callout types in minimap

---

## Data Flow

### Opening a Document

1. User clicks ribbon icon or runs "Open Long View" command
2. `LongViewPlugin.activateView()` creates or reveals the custom view
3. `LongView.onOpen()` builds the header UI (mode buttons, zoom, refresh)
4. `LongView` detects the active editor and sets `linkedLeafId`
5. Initial render triggers based on the persisted `viewMode` setting

### Switching Modes

1. User clicks "Minimap" or "Paged" button
2. `LongView.switchMode()` is called
3. Previous renderer is destroyed; a new one is created
4. For minimap: `buildMinimapSections()` parses the document; `MiniMapRenderer` renders
5. For paged: `parseDocumentIntoPages()` paginates; `renderPageContent()` renders each page

### Scrolling in Editor

1. Editor fires `"editor-scroll"` event
2. `LongView.updateActiveHeading()` is called
3. Minimap locates the heading nearest to the scroll position
4. The corresponding heading element in the minimap is highlighted with a colored bar

### Clicking in Minimap

1. User clicks a heading, image, or flag in the minimap
2. Callback handler (e.g., `onHeadingClick`) receives the text offset
3. `LongView` sets editor cursor/scroll to that offset, bringing it into view

### Updating Settings

1. User adjusts a setting (e.g., font size, custom flag color) in the settings tab
2. Change is saved to Obsidian's data storage
3. `LongViewPlugin.saveSettings()` is called
4. `LongViewPlugin.applyFlagStyles()` regenerates CSS
5. `LongViewPlugin.refreshOpenViews()` calls `updateView()` on all open Long View panels

### Copy Without Flags

1. User runs "Copy document without flags" command
2. `copyStrippedContent()` extracts the active editor text
3. `stripFlagsAndComments()` removes all flag and comment patterns
4. Result is copied to clipboard (plain text or HTML rendered)

---

## Key Design Patterns

### 1. Modular Rendering

Each rendering mode (minimap, paged) has its own renderer class/function:
- `MiniMapRenderer` – Complex class with state tracking, numbering, active heading highlighting
- `renderPageContent()` – Simpler function for paged output

This separation makes it easy to:
- Add new rendering modes (e.g., timeline, outline)
- Optimize each mode independently
- Test rendering in isolation

### 2. Plugin State Separation

User settings are stored separately from transient UI state:
- **Persisted:** Font sizes, colors, default zoom, hidden flags
- **Transient:** Current zoom level, active mode, open filter panel, current file

This allows settings to sync across multiple open views while preserving each view's local scroll state.

### 3. Color Configuration

Colors are centralized in two maps (`flagColors`, `sectionFlagColors`) and referenced throughout:
- In rendering (`miniMapRenderer.ts`, `simplePageRenderer.ts`)
- In inline highlighting (`flagStyling.ts`)
- In CSS generation (`main.ts`)

This ensures visual consistency and makes color theme updates trivial.

### 4. Lazy Parsing

Document parsing (headings, flags) happens only when needed:
- Parse on demand in `updateView()`
- Cache results during the current render cycle
- Re-parse only when switching files or refreshing

This keeps performance smooth for large documents.

### 5. Callout Stack Tracking

Callout backgrounds are managed as nested wrappers:
- As we iterate through headings, we track which callouts remain "open"
- New callouts push onto the stack; sections pop off
- This allows callout tints to span entire hierarchical regions without interruption

---

## Extension Points

### Adding a New Flag Type

1. Define the flag type and default color in `src/settings.ts`:
   ```typescript
   export const DEFAULT_FLAG_COLORS: FlagColorMap = {
     CUSTOMFLAG: "#123456",
     // ...
   };
   ```

2. The flag parsing regex in `documentParser.ts` already matches any `==TYPE: message ==` pattern, so detection is automatic.

3. Users can add custom flag types via the Settings tab (CRUD interface).

4. Colors are applied automatically in:
   - Minimap renderer (`.long-view-minimap-flag.long-view-flag-type-customflag`)
   - Paged renderer (`.long-view-flag-bar.long-view-flag-type-customflag`)
   - Inline highlighting (`.long-view-inline-flag.long-view-inline-flag-customflag`)

### Adding a New Rendering Mode

1. Create a new renderer class or function (e.g., `TimelineRenderer.ts`)

2. Implement the same interface expected by `LongView`:
   - Constructor takes renderer options (app, container, source path, callbacks)
   - Provides a `render()` method

3. In `LongView.switchMode()`, add a case for your new mode:
   ```typescript
   case "timeline":
     this.minimapRenderer = new TimelineRenderer(options);
     await this.minimapRenderer.render(this.pages, this.minimapSections);
     break;
   ```

4. Add UI controls (e.g., button in header) as needed

### Customizing Flag Display

1. **Font sizes** – Update `minimapFontSizes` in settings
2. **Colors** – Use color picker in settings tab or edit `flagColors` directly
3. **Visibility** – Use "Filters" dropdown in minimap to hide/show flag types
4. **Inline styling** – Edit `styles.css` to modify flag appearance (border, shadow, etc.)

---

## Performance Considerations

### Rendering

- **Minimap:** O(n) where n = document word count. Scales well to 50k+ words.
- **Paged:** O(n / 450) pages rendered; pages are rendered lazily in visible viewport.

### Caching

- Document is parsed once per `updateView()` call
- Heading offsets are cached in `miniMapRenderer.headingEntries`
- Callout stacks are computed once and reused during rendering

### Debouncing

- Editor scroll events do NOT trigger re-render; they only update the highlight position
- Refresh is manual (click button) or automatic on file change
- Zoom adjustments use CSS transforms (GPU-accelerated) rather than DOM re-renders

### Memory

- Large documents are kept in memory as a single text string
- Heading and flag lists are proportional to content structure, not size
- Image thumbnails are rendered as `<img>` tags and cached by browser

---

## Testing Strategy

### Unit Tests (Recommended)

- **`documentParser.ts`**: Test heading/flag extraction with edge cases (unicode, nested flags, malformed callouts)
- **`minimapParser.ts`**: Verify single-page output preserves full document structure
- **`simplePagination.ts`**: Test pagination at various word counts and heading distributions
- **`flagColors.ts`, **`sectionFlagColors.ts`**: Test color lookups with custom and default colors

### Integration Tests (Recommended)

- **Mode switching:** Open view, switch between minimap and paged, verify content updates
- **Scroll sync:** Scroll editor, confirm minimap highlights correct heading
- **Click navigation:** Click heading in minimap, confirm editor jumps to that location
- **Settings:** Change font size/color, refresh, verify appearance updates

### Manual Testing

- Open files of varying sizes (100 words, 10k words, 100k words)
- Test with various markdown structures (nested headings, callouts, flags, images)
- Verify scroll performance on low-end devices
- Test mobile layout (minimap adapts to narrow screens)

---

## Troubleshooting Guide for Developers

### View Not Appearing

- **Check:** Is `registerView(LONG_VIEW_TYPE, ...)` called in `onload()`?
- **Check:** Is the leaf being created in the correct workspace location?
- **Check:** Are there console errors in DevTools?

### Flags Not Detected

- **Check:** Is the flag regex correct? (Should be `/==(.*?):\s*(.*?)\s*==/g`)
- **Check:** Are spaces present after colon and before closing `==`?
- **Check:** Is `parseFlags()` being called before rendering?

### Colors Not Updating

- **Check:** Are flag colors set in `flagColors` map before rendering?
- **Check:** Is `applyFlagStyles()` being called after settings change?
- **Check:** Is CSS being injected into the document head?

### Performance Issues

- **Check:** Is `updateView()` being called too frequently? (Should be manual or on file change)
- **Check:** Is the document very large (>100k words)? Consider pagination limits.
- **Check:** Are image thumbnails loading slowly? Check vault path resolution.

### Editor Scroll Not Syncing

- **Check:** Is `linkedLeafId` set correctly to the active editor?
- **Check:** Is `registerDomEvent()` or similar used for scroll listeners?
- **Check:** Are heading offsets accurate relative to document positions?

---

## References

- **Obsidian API:** https://docs.obsidian.md/
- **Sample Plugin:** https://github.com/obsidianmd/obsidian-sample-plugin
- **CodeMirror 6:** https://codemirror.net/docs/guide/
- **Markdown Spec:** https://spec.commonmark.org/

---

**Last Updated:** November 2025
**Plugin Version:** 1.0.6+
