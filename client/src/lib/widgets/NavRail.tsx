// The studio's left nav strip (presentational molecule): a permanent vertical column of section
// buttons carved from the left rail. Props-only — the active section + selection are owned by the
// Canvas. The matching panel (Outline / designer / sensors / …) renders beside it.
import { SECTIONS, type Section, type SectionId } from './canvas/studioSections';
import './NavRail.css';

type Props = {
	active: SectionId;
	onSelect: (id: SectionId) => void;
	// While designing a widget def the nav is modal (you leave via the banner's Done). We mark it
	// aria-disabled + dimmed + explain why on hover, rather than hard-`disabled` (which would suppress
	// the tooltip) — so a click no longer silently does nothing.
	disabled?: boolean;
};

export default function NavRail({ active, onSelect, disabled = false }: Props) {
	const item = (s: Section) => (
		<button
			key={s.id}
			type="button"
			data-section={s.id}
			className={['nav-item', s.id === active && 'active', disabled && 'disabled']
				.filter(Boolean)
				.join(' ')}
			aria-disabled={disabled || undefined}
			title={
				disabled
					? 'Finish the widget (Done) to leave the designer'
					: s.label + (s.stub ? ' (coming soon)' : '')
			}
			onClick={() => {
				if (!disabled) onSelect(s.id);
			}}
		>
			<span className="nav-icon">{s.icon}</span>
			<span className="nav-short">{s.short}</span>
		</button>
	);
	return (
		<div className="nav-rail">
			{SECTIONS.filter((s) => s.group === 'main').map(item)}
			<div className="nav-spacer" />
			{SECTIONS.filter((s) => s.group === 'foot').map(item)}
		</div>
	);
}
