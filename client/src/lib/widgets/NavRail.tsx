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
			// Convey the open section to assistive tech (the visual cue is colour-only otherwise — WCAG
			// 1.4.1). aria-current marks the active rail item as the current "page" of the studio.
			aria-current={s.id === active ? 'page' : undefined}
			onClick={() => onSelect(s.id)}
		>
			{/* Decorative glyph: the .nav-short text + title already name the button, so hide the icon
			    from screen readers to avoid a doubled / emoji-name announcement. */}
			<span className="nav-icon" aria-hidden="true">
				{s.icon}
			</span>
			<span className="nav-short">{s.short}</span>
		</button>
	);
	return (
		<nav className="nav-rail" aria-label="Studio sections">
			{SECTIONS.filter((s) => s.group === 'main').map(item)}
			<div className="nav-spacer" />
			{SECTIONS.filter((s) => s.group === 'foot').map(item)}
		</nav>
	);
}
