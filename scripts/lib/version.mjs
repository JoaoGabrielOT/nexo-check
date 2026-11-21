const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

function parse(version) {
  const m = SEMVER.exec(String(version).trim());
  if (!m) throw new Error(`Versão inválida (esperado X.Y.Z): ${version}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (minor > 99 || patch > 99) {
    throw new Error(`minor e patch devem ser <= 99 (o versionCode colidiria): ${version}`);
  }
  return { major, minor, patch };
}

/** major*10000 + minor*100 + patch; lança se minor/patch > 99. */
export function versionCode(version) {
  const { major, minor, patch } = parse(version);
  return major * 10000 + minor * 100 + patch;
}

/** versionCode do Android: a versão de desenvolvimento 0.0.0 grava 1 (o Android exige >= 1). */
export function androidVersionCode(version) {
  return Math.max(1, versionCode(version));
}

export function bumpVersion(version, kind) {
  const { major, minor, patch } = parse(version);
  const next =
    kind === 'major'
      ? [major + 1, 0, 0]
      : kind === 'minor'
        ? [major, minor + 1, 0]
        : kind === 'patch'
          ? [major, minor, patch + 1]
          : null;
  if (!next) throw new Error(`Tipo de versão inválido: ${kind}`);
  const result = next.join('.');
  parse(result);
  return result;
}
