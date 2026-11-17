export const CONTENT_DIR: string;
export const OUT_FILE: string;
export function readContentFiles(): Record<string, string>;
export function generateContentModule(files: Record<string, string>): string;
export function readGenerated(): string;
