export type ViewMode = "minimap" | "paged";

// Colors for flags keyed by uppercase flag name
export type FlagColorMap = Record<string, string>;
export type SectionFlagColorMap = Record<string, string>;

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
  includeImagesInMinimap: boolean;
  showFlagTypesInMinimap: boolean; // show TYPE labels in minimap for flags/callouts (excludes COMMENT and SUMMARY)
  minimapHiddenFlags: string[]; // uppercased flag types to hide in minimap
  flagColors: FlagColorMap;
  customFlags: CustomFlag[];
  sectionFlagColors: SectionFlagColorMap;
  customSectionFlags: CustomFlag[];
  minimapHiddenSectionFlags: string[];
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

export const DEFAULT_SECTION_FLAG_COLORS: SectionFlagColorMap = {
  SUMMARY: "#b8b8b8",
  NOTE: "#086ddd",
  INFO: "#086ddd",
  TIP: "#00bfbc",
  HINT: "#00bfbc",
  IMPORTANT: "#00bfbc",
  WARNING: "#ec7500",
  CAUTION: "#ec7500",
  ATTENTION: "#ec7500",
  DANGER: "#e93147",
  BUG: "#e93147",
  ERROR: "#e93147",
  FAIL: "#e93147",
  SUCCESS: "#08b94e",
  CHECK: "#08b94e",
  DONE: "#08b94e",
  QUESTION: "#ec7500",
  HELP: "#ec7500",
  FAQ: "#ec7500",
  EXAMPLE: "#7852ee",
  QUOTE: "#7852ee",
  CITE: "#7852ee",
  ABSTRACT: "#00bfbc",
  TLDR: "#00bfbc",
  DEFAULT: "#086ddd",
};

export const DEFAULT_SECTION_CUSTOM_FLAGS: CustomFlag[] = [];

export const DEFAULT_SETTINGS: LongViewSettings = {
  defaultZoom: 15, // 15% zoom as default (5-30% range)
  viewMode: "minimap",
  showParagraphsInMinimap: true,
  numberSections: true,
  includeCommentsInMinimap: true,
  includeImagesInMinimap: true,
  showFlagTypesInMinimap: false,
  minimapHiddenFlags: [],
  flagColors: { ...DEFAULT_FLAG_COLORS },
  customFlags: [
    { name: "REWRITE", color: DEFAULT_FLAG_COLORS.REWRITE },
    { name: "RESEARCH", color: DEFAULT_FLAG_COLORS.RESEARCH },
  ],
  sectionFlagColors: { ...DEFAULT_SECTION_FLAG_COLORS },
  customSectionFlags: [],
  minimapHiddenSectionFlags: [],
  minimapFontSizes: {
    body: 3,
    heading: 12,
    flag: 12,
  },
  minimapLineGap: 2,
};
