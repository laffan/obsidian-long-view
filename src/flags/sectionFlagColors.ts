import { DEFAULT_SECTION_FLAG_COLORS } from "../settings";

type SectionFlagColorMapInternal = Record<string, string>;

let sectionFlagColorMap: SectionFlagColorMapInternal = {
  ...DEFAULT_SECTION_FLAG_COLORS,
};

function normalizeKeys(colors: Record<string, string>): SectionFlagColorMapInternal {
  const normalized: SectionFlagColorMapInternal = {};
  for (const [key, value] of Object.entries(colors)) {
    if (!key) continue;
    normalized[key.toUpperCase()] = value;
  }
  return normalized;
}

export function setSectionFlagColorMap(colors: Record<string, string>): void {
  sectionFlagColorMap = {
    ...DEFAULT_SECTION_FLAG_COLORS,
    ...normalizeKeys(colors),
  };
}

export function getSectionFlagColor(type: string): string {
  const normalized = (type || "").toUpperCase();
  if (normalized in sectionFlagColorMap) {
    return sectionFlagColorMap[normalized];
  }
  if ("DEFAULT" in sectionFlagColorMap) {
    return sectionFlagColorMap.DEFAULT;
  }
  return "#086ddd";
}

export function getSectionFlagColorMap(): SectionFlagColorMapInternal {
  return { ...sectionFlagColorMap };
}
