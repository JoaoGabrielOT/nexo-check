// Gera src/content.generated.ts a partir de content/ (.md e .json).
/* global console */
import { writeFileSync } from 'node:fs';
import { OUT_FILE, generateContentModule, readContentFiles } from './content-module.mjs';

writeFileSync(OUT_FILE, generateContentModule(readContentFiles()), 'utf8');
console.log(`conteúdo gerado em ${OUT_FILE}`);
