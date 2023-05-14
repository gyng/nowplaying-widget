import type { MediaRecord } from '../../../stores/stores';

export const sortMediaByPriority = (
	currentMedia: Record<string, MediaRecord>,
	sourcePriority: string
) => {
	const orderedMedia = Object.values(currentMedia)
		.sort((a, b) => b.timestamp - a.timestamp)
		.sort((a, b) => {
			let aPriority = sourcePriority.indexOf(a.session?.source.toLowerCase() ?? '_____FIXME_____');
			let bPriority = sourcePriority.indexOf(b.session?.source.toLowerCase() ?? '_____FIXME_____');

			aPriority = aPriority === -1 ? Number.MAX_VALUE : aPriority;
			bPriority = bPriority === -1 ? Number.MAX_VALUE : bPriority;

			return aPriority - bPriority;
		})
		.sort((_, b) => (b.session?.playback?.status === 'Playing' ? 1 : -1));

	return orderedMedia;
};
