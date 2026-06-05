// Spacer (presentational, props-only): an invisible, space-occupying widget. Its only job is to take
// up room in a flow/grid so neighbouring widgets are pushed apart — it renders NOTHING on the live
// overlay. While EDITING it shows a faint dashed outline + tag so the otherwise-empty box is visible,
// selectable and resizable. binds:'none', no sensor, no config.
import './Spacer.css';

type Props = { editMode?: boolean };

export default function Spacer({ editMode }: Props) {
	if (!editMode) return null; // pure whitespace on the passive overlay
	return (
		<div className="spacer-widget">
			<span className="spacer-tag">⌷ spacer</span>
		</div>
	);
}
