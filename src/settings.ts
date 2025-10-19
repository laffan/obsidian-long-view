export type ViewMode = 'minimap' | 'paged';

export interface LongViewSettings {
	defaultZoom: number;
	viewMode: ViewMode;
	showParagraphsInMinimap: boolean;
}

export const DEFAULT_SETTINGS: LongViewSettings = {
	defaultZoom: 15, // 15% zoom as default (5-30% range)
	viewMode: 'minimap',
	showParagraphsInMinimap: true,
};
