export type ViewMode = "minimap" | "paged";

// Colors for flags keyed by uppercase flag name
export type FlagColorMap = Record<string, string>;

export type CustomFlag = { name: string; color: string };

export interface MinimapFontSettings {
  body: number; // base paragraph font size (px)
  heading: number; // heading font base (px)
  flag: number; // flag message font size (px)
}

export interface LongViewSettings {
  defaultZoom: number;
  viewMode: ViewMode;
  showParagraphsInMinimap: boolean;
  numberSections: boolean;
  includeCommentsInMinimap: boolean;
  flagColors: FlagColorMap;
  customFlags: CustomFlag[];
  minimapFontSizes: MinimapFontSettings;
  minimapLineGap: number;
}

export const DEFAULT_FLAG_COLORS: FlagColorMap = {
  TODO: "#ffd700",
  COMMENT: "#888888",
  MISSING: "#ff4444",
  // Defaults for initial custom flags
  REWRITE: "#ff66aa",
  RESEARCH: "#66aaff",
};

export const DEFAULT_SETTINGS: LongViewSettings = {
  defaultZoom: 15, // 15% zoom as default (5-30% range)
  viewMode: "minimap",
  showParagraphsInMinimap: true,
  numberSections: true,
  includeCommentsInMinimap: true,
  flagColors: { ...DEFAULT_FLAG_COLORS },
  customFlags: [
    { name: "REWRITE", color: DEFAULT_FLAG_COLORS.REWRITE },
    { name: "RESEARCH", color: DEFAULT_FLAG_COLORS.RESEARCH },
  ],
  minimapFontSizes: {
    body: 3,
    heading: 12,
    flag: 12,
  },
  minimapLineGap: 2,
};
