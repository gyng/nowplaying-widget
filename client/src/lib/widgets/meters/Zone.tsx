// Landing-zone meter (presentational, props-only). A zone is a snap target, not a display, so it
// renders NOTHING on the live overlay — only an outline + tag while EDITING (studio, or an overlay
// toggled into edit mode), so you can see/place it. The overlay's DragSnapLayer reads the zone
// widget's rect from the layout to highlight + snap; this component is purely the editor affordance.
import './Zone.css';

type Props = {
	editMode?: boolean;
	matchExe?: string;
	matchClass?: string;
	matchTitle?: string;
};

export default function Zone({ editMode, matchExe, matchClass, matchTitle }: Props) {
	if (!editMode) return null; // invisible on the passive overlay — it's just a snap region
	const rule = [matchExe, matchClass, matchTitle].filter(Boolean).join(' · ');
	return (
		<div className="zone-widget">
			<span className="zone-tag">⊞ zone{rule ? ` · ${rule}` : ''}</span>
		</div>
	);
}
