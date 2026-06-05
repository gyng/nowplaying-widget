// The studio's left nav strip (presentational molecule): a permanent vertical column of section
// buttons carved from the left rail. Props-only — the active section + selection are owned by the
// Canvas. The matching panel (Outline / designer / sensors / …) renders beside it.
import { SECTIONS, type Section, type SectionId } from './canvas/studioSections';
import './NavRail.css';

type Props = {
	active: SectionId;
	onSelect: (id: SectionId) => void;
};

export default function NavRail({ active, onSelect }: Props) {
	const item = (s: Section) => (
		<button
			key={s.id}
			type="button"
			data-section={s.id}
			className={['nav-item', s.id === active && 'active'].filter(Boolean).join(' ')}
			title={s.label + (s.stub ? ' (coming soon)' : '')}
			onClick={() => onSelect(s.id)}
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
