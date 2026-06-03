import type { SessionRecord } from '../../../stores/stores';

// Drop sessions whose source is on the ignore list. `ignoreList` is the newline-separated,
// (already-lowercased) blocklist from the store; a session is hidden if any non-blank line is a
// substring of its lowercased source — so typing `foobar2000` blocks `foobar2000.exe`. Pure.
export const filterIgnored = (
	sessions: Record<number, SessionRecord>,
	ignoreList: string
): Record<number, SessionRecord> => {
	const terms = ignoreList
		.split('\n')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	if (!terms.length) return sessions;
	const kept: Record<number, SessionRecord> = {};
	for (const [id, rec] of Object.entries(sessions)) {
		const source = (rec?.source ?? '').toLowerCase();
		if (!terms.some((t) => source.includes(t))) kept[Number(id)] = rec;
	}
	return kept;
};

export const sortSessionsByPriority = (
	currentSessions: Record<number, SessionRecord>,
	sourcePriority: string
) => {
	const orderedMedia = Object.values(currentSessions)
		.sort(
			(a, b) =>
				(b?.timestamp_updated?.secs_since_epoch ?? 0) -
				(a?.timestamp_updated?.secs_since_epoch ?? 0)
		)
		.sort((a, b) => {
			let aPriority = sourcePriority.indexOf(a?.source?.toLowerCase() ?? '_____FIXME_____');
			let bPriority = sourcePriority.indexOf(b?.source?.toLowerCase() ?? '_____FIXME_____');

			aPriority = aPriority === -1 ? Number.MAX_VALUE : aPriority;
			bPriority = bPriority === -1 ? Number.MAX_VALUE : bPriority;

			return aPriority - bPriority;
		})
		.sort((_, b) => (b.last_model_update?.Model?.playback?.status === 'Playing' ? 1 : -1));

	return orderedMedia;
};
