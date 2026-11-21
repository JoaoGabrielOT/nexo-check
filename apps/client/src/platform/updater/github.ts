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

/** Só `nexo-check-<versão>.apk` com tamanho conhecido, hospedado nas releases do repositório. */
export function pickApkAsset(
  assets: { name: string; size: number; browser_download_url: string }[],
  version: string,
): ApkAsset | null {
  const expected = `nexo-check-${version}.apk`.toLowerCase();
  const found = assets.find(
    (a) =>
      a.name.toLowerCase() === expected &&
      a.size > 0 &&
      a.browser_download_url.startsWith(RELEASE_DOWNLOAD_PREFIX),
  );
  return found ? { name: found.name, size: found.size, url: found.browser_download_url } : null;
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
  const asset = pickApkAsset(release.assets, version);
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
