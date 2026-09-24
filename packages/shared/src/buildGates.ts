// ============================================================
// llama.cpp build feature gates
// Central place for "does this build support flag X" checks,
// used by both the backend (processManager) and the frontend
// (LaunchServer dialog) so they never disagree.
// ============================================================

// b10105: -lm/--load-mode introduced (replaces --mlock/--mmap/--no-mmap/-dio)
export const MIN_BUILD_LOAD_MODE = 10105;
// b9100: new spec-decoding flag names (--spec-draft-n-max/-min, --spec-draft-p-min)
export const MIN_BUILD_SPEC_DRAFT = 9100;

export function supportsLoadMode(buildNumber: number): boolean {
	return buildNumber >= MIN_BUILD_LOAD_MODE;
}

export function supportsNewSpecFlags(buildNumber: number): boolean {
	return buildNumber >= MIN_BUILD_SPEC_DRAFT;
}

// Parse a backend buildNumber string (may be empty/invalid) into an int.
export function parseBuildNumber(buildNumber: string | undefined | null): number {
	const n = parseInt(buildNumber ?? "", 10);
	return Number.isNaN(n) ? 0 : n;
}
