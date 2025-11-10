import { App, TFile } from "obsidian";
import { parseFlags } from "./documentParser";
import { DocumentFlag } from "./documentParser";

export interface FlagInstance {
  flag: DocumentFlag;
  file: TFile;
  lineNumber: number;
}

export interface FlagsByFile {
  [filePath: string]: {
    file: TFile;
    flagsByType: {
      [flagType: string]: FlagInstance[];
    };
  };
}

export interface FlagsByFolder {
  [folderPath: string]: FlagsByFile;
}

/**
 * Scans all markdown files in the vault and collects flags
 */
export async function scanVaultForFlags(app: App): Promise<FlagsByFolder> {
  const result: FlagsByFolder = {};

  // Get all markdown files
  const files = app.vault.getMarkdownFiles();

  for (const file of files) {
    try {
      const content = await app.vault.read(file);
      const flags = parseFlags(content, 0);

      if (flags.length === 0) continue;

      // Get folder path (or root if no folder)
      const folderPath = file.parent?.path || "/";

      // Initialize folder if needed
      if (!result[folderPath]) {
        result[folderPath] = {};
      }

      // Initialize file entry if needed
      if (!result[folderPath][file.path]) {
        result[folderPath][file.path] = {
          file: file,
          flagsByType: {},
        };
      }

      // Group flags by type for this file
      for (const flag of flags) {
        const flagType = flag.type.toUpperCase();

        if (!result[folderPath][file.path].flagsByType[flagType]) {
          result[folderPath][file.path].flagsByType[flagType] = [];
        }

        // Calculate line number from offset
        const lineNumber = content.substring(0, flag.startOffset).split("\n").length;

        result[folderPath][file.path].flagsByType[flagType].push({
          flag,
          file,
          lineNumber,
        });
      }
    } catch (error) {
      console.error(`Error scanning file ${file.path}:`, error);
    }
  }

  return result;
}
