import { FlagType, FLAG_TYPES } from './flags/flagData';

export type ViewMode = 'minimap' | 'paged';

export type FlagColorMap = Record<FlagType, string>;

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
	flagColors: FlagColorMap;
	minimapFontSizes: MinimapFontSettings;
	minimapLineGap: number;
}

export const DEFAULT_FLAG_COLORS: FlagColorMap = {
	TODO: '#ffd700',
	NOW: '#ff4444',
	DONE: '#44ff44',
	WAITING: '#ff9944',
	NOTE: '#4488ff',
	IMPORTANT: '#ff44ff',
	COMMENT: '#888888',
	MISSING: '#ff4444',
};

export const DEFAULT_SETTINGS: LongViewSettings = {
	defaultZoom: 15, // 15% zoom as default (5-30% range)
	viewMode: 'minimap',
	showParagraphsInMinimap: true,
	numberSections: true,
	flagColors: { ...DEFAULT_FLAG_COLORS },
	minimapFontSizes: {
		body: 3,
		heading: 12,
		flag: 12,
	},
	minimapLineGap: 2,
};
