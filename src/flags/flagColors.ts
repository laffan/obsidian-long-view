type FlagColorInternalMap = Record<string, string>;

let flagColorMap: FlagColorInternalMap = {};

export function setFlagColorMap(colors: FlagColorInternalMap): void {
  flagColorMap = { ...colors };
}

export function getFlagColor(type: string): string {
  const normalized = (type || "").toUpperCase();
  if (normalized in flagColorMap) return flagColorMap[normalized];
  // Fallback to a reasonable default if unknown
  return flagColorMap["RESEARCH"] || "#4488ff";
}

export function getFlagColorMap(): FlagColorInternalMap {
  return { ...flagColorMap };
}
