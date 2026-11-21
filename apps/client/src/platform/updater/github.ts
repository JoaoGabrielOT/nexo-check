import { z } from 'zod';
import { compareSemver } from '@nexo/shared';
import { RELEASES_LATEST_API, RELEASE_DOWNLOAD_PREFIX } from '../../config';
import { UpdateCheckError, type UpdateInfo } from './types';

export const githubReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullable().optional(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z.array(
    z.object({
      name: z.string(),
      size: z.number().int().min(0),
      browser_download_url: z.string(),
    }),
  ),
});

export interface ApkAsset {
  name: string;
  size: number;
  url: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** Caminho exato do asset: `/<dono>/<repo>/releases/download/<tag>/<nome>` em github.com, sem query. */
function parseAssetUrl(raw: string, tag: string, name: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const base = new URL(RELEASE_DOWNLOAD_PREFIX);
  const ok =
    url.protocol === 'https:' &&
    url.host === base.host &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname === `${base.pathname}${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
  return ok ? url : null;
}

/** Só `nexo-check-<versão>.apk` com tamanho conhecido, hospedado na release `tag` do repositório. */
export function pickApkAsset(
  assets: { name: string; size: number; browser_download_url: string }[],
  version: string,
  tag: string = `v${version}`,
): ApkAsset | null {
  const expected = `nexo-check-${version}.apk`.toLowerCase();
  for (const a of assets) {
    if (a.name.toLowerCase() !== expected || a.size <= 0) continue;
    const url = parseAssetUrl(a.browser_download_url, tag, a.name);
    if (url) return { name: a.name, size: a.size, url: url.href };
  }
  return null;
}

/** Decide se a release mais recente é uma atualização instalável; qualquer dúvida vira `null`. */
export function evaluateRelease(
  json: unknown,
  currentVersion: string,
): { info: UpdateInfo; asset: ApkAsset } | null {
  const parsed = githubReleaseSchema.safeParse(json);
  if (!parsed.success) return null;
  const release = parsed.data;
  if (release.draft || release.prerelease) return null;
  const version = release.tag_name.trim().replace(/^v/i, '');
  if (!VERSION.test(version)) return null;
  if (compareSemver(version, currentVersion) <= 0) return null;
  const asset = pickApkAsset(release.assets, version, release.tag_name.trim());
  if (!asset) return null;
  return { info: { version, notes: release.body ?? '' }, asset };
}

export async function fetchLatestRelease(fetchFn: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(RELEASES_LATEST_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UpdateCheckError(0);
  }
  if (!res.ok) throw new UpdateCheckError(res.status);
  try {
    return await res.json();
  } catch {
    throw new UpdateCheckError(res.status);
  }
}
