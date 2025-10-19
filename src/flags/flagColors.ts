import { FlagType, FLAG_TYPES } from './flagData';

type FlagColorInternalMap = Record<FlagType, string>;

let flagColorMap: FlagColorInternalMap = {
	TODO: '#ffd700',
	NOW: '#ff4444',
	DONE: '#44ff44',
	WAITING: '#ff9944',
	NOTE: '#4488ff',
	IMPORTANT: '#ff44ff',
	COMMENT: '#888888',
	MISSING: '#ff4444',
};

export function setFlagColorMap(colors: FlagColorInternalMap): void {
	flagColorMap = { ...colors };
}

export function getFlagColor(type: string): string {
	const normalized = (type || '').toUpperCase() as FlagType;
	if ((FLAG_TYPES as readonly string[]).includes(normalized)) {
		return flagColorMap[normalized as FlagType];
	}
	return flagColorMap.NOTE;
}

export function getFlagColorMap(): FlagColorInternalMap {
	return { ...flagColorMap };
}
