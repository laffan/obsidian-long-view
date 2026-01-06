# Long View

Long View is an [Obsidian](https://obsidian.md/) plugin to help keep track of long markdown documents. It is composed of three views :

1. **mini-map view** : Document outline + mini text so you can see where you are in the document.
2. **paged view** : approximate print preview, showing how many pages in a document.
3. **flag view** : a valut-wide list of flagged material with links.

Long view supports two flagging systems:

## Inline Flags
All three views support a flagging syntax that is a slightly modified version of Obsidian's existing highlighter.  In addition to the the double ==, add the flag name and colon (no spaces).  Flagged text can also be optionally broken down in to title and summary fragments by adding a pipe character. 

In practice, this looks like `==FLAG: short title | summary of content (optional)==`

The built-in flags are:

- `==TODO: message ==` → Yellow
- `==MISSING: message ==` → Red
- `%% comment %%` → Gray

But these can be added to and given colors in the options panel. 


## Section Flags

You can also flag an enitre section by placing a callout directly under the heading of a section - no breaks in between. 

## Using Long View

1. Open any markdown file in Obsidian.
2. Activate Long View via ribbon icon or command palette (`Long View: Open Long View`).
3. **Choose your mode**: Click "Minimap" for continuous overview, or "Paged" for print-style pages.
4. **Use Filters**: In Minimap, click "Filters" to expand a right-aligned toggle list for Text, Numbers, Images, Comments, all line flags, all section flags, and each detected flag type (entries include a colored dot).
5. **Navigate**: Click headings, images, or flags to jump the editor to that location.
6. **Refresh**: Click the ♻️ button to update the view with your latest edits.

## Command Palette Utilities

Long View adds clipboard helpers so flags aren't included in copied text:

- `Long View: Copy document without flags` – Copies the entire note as plain text.
- `Long View: Copy selection without flags` – Copies only the current selection as plain text.
- `Long View: Copy document without flags (HTML)` – Copies the whole note as HTML, suitable for rich-text pasting.
- `Long View: Copy selection without flags (HTML)` – Copies the current selection as HTML.

## Installation

1. Download the zipped release file and unzip it. 
2. In Obsidian, navigate to Settings > Community Plugins. 
3. Click the folder icon above the "Installed plugins" list.  
4. Drag the unzipped release in to "plugins" folder.
5. Click the refresh icon above the "Installed plugins" list. 

You should see the plugin. Follow the same steps to update. 

## License

MIT
