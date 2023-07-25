import type { SessionRecord } from '../../../stores/stores';

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
