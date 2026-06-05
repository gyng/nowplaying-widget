import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ThemeList, { filterThemes, type ThemeGroup } from './ThemeList';

describe('filterThemes', () => {
	const themes = ['amber', 'mono', 'midnight-blue'];

	it('returns all for an empty/whitespace query', () => {
		expect(filterThemes(themes, '')).toEqual(themes);
		expect(filterThemes(themes, '  ')).toEqual(themes);
	});

	it('matches a case-insensitive substring', () => {
		expect(filterThemes(themes, 'm')).toEqual(['amber', 'mono', 'midnight-blue']); // all contain 'm'
		expect(filterThemes(themes, 'mo')).toEqual(['mono']);
		expect(filterThemes(themes, 'AMBER')).toEqual(['amber']);
		expect(filterThemes(themes, 'blue')).toEqual(['midnight-blue']);
	});

	it('returns [] when nothing matches', () => {
		expect(filterThemes(themes, 'zzz')).toEqual([]);
	});
});

describe('<ThemeList>', () => {
	const groups: ThemeGroup[] = [
		{
			key: 'classic',
			label: 'Classic',
			items: [
				{
					value: 'builtin:app',
					label: 'App',
					swatch: { bg: '#0b0b0e', accent: '#77c4d3', fg: '#fff' }
				}
			]
		},
		{ key: 'dark', label: 'Dark', items: [{ value: 'builtin:nord', label: 'Nord' }] }
	];

	const setup = (active = '') => {
		const onPick = vi.fn();
		const onEdit = vi.fn();
		const onDuplicate = vi.fn();
		const onDelete = vi.fn();
		render(
			<ThemeList
				groups={groups}
				userThemes={[{ value: 'my-theme', label: 'my-theme' }]}
				active={active}
				onPick={onPick}
				onEdit={onEdit}
				onDuplicate={onDuplicate}
				onDelete={onDelete}
			/>
		);
		return { onPick, onEdit, onDuplicate, onDelete };
	};

	it('renders the default reset, the built-in groups, and the user section', () => {
		setup();
		expect(screen.getByText('(default)')).toBeInTheDocument();
		expect(screen.getByText('Classic')).toBeInTheDocument();
		expect(screen.getByText('Dark')).toBeInTheDocument();
		expect(screen.getByText('Your themes')).toBeInTheDocument();
		expect(screen.getByText('App')).toBeInTheDocument();
		expect(screen.getByText('Nord')).toBeInTheDocument();
		expect(screen.getByText('my-theme')).toBeInTheDocument();
	});

	it('renders a colour swatch on a row that has one, filled with the theme surface', () => {
		setup();
		const appRow = screen.getByText('App').closest('.theme-item') as HTMLElement;
		const sw = appRow.querySelector('.np-swatch') as HTMLElement;
		expect(sw).not.toBeNull();
		expect(sw.style.background).toContain('#0b0b0e'); // the theme surface fills the swatch
		expect(sw.querySelectorAll('.np-swatch-dot')).toHaveLength(2); // accent + fg dots
		// A row whose swatch hasn't been parsed yet (user theme still loading) shows the neutral chip.
		const userRow = screen.getByText('my-theme').closest('.theme-item') as HTMLElement;
		expect(userRow.querySelector('.np-swatch-empty')).not.toBeNull();
	});

	it('picks a built-in by its namespaced value', () => {
		const { onPick } = setup();
		fireEvent.click(screen.getByRole('button', { name: /^Nord/ }));
		expect(onPick).toHaveBeenCalledWith('builtin:nord');
	});

	it('picks the default reset with the empty value', () => {
		const { onPick } = setup('builtin:nord');
		fireEvent.click(screen.getByRole('button', { name: /\(default\)/ }));
		expect(onPick).toHaveBeenCalledWith('');
	});

	it('offers only duplicate (no edit / delete) for an immutable built-in', () => {
		const { onDuplicate, onEdit, onDelete } = setup();
		const nordRow = screen.getByText('Nord').closest('.theme-item') as HTMLElement;
		expect(within(nordRow).queryByLabelText(/^Edit/)).toBeNull();
		expect(within(nordRow).queryByLabelText(/^Delete/)).toBeNull();
		fireEvent.click(within(nordRow).getByLabelText('Duplicate Nord'));
		expect(onDuplicate).toHaveBeenCalledWith('builtin:nord');
		expect(onEdit).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();
	});

	it('offers edit / duplicate / delete for a user theme, keyed by its name', () => {
		const { onEdit, onDuplicate, onDelete } = setup();
		const row = screen.getByText('my-theme').closest('.theme-item') as HTMLElement;
		fireEvent.click(within(row).getByLabelText('Edit my-theme CSS'));
		fireEvent.click(within(row).getByLabelText('Duplicate my-theme'));
		fireEvent.click(within(row).getByLabelText('Delete my-theme'));
		expect(onEdit).toHaveBeenCalledWith('my-theme');
		expect(onDuplicate).toHaveBeenCalledWith('my-theme');
		expect(onDelete).toHaveBeenCalledWith('my-theme');
	});

	it('marks the active row', () => {
		setup('builtin:nord');
		const nordRow = screen.getByRole('button', { name: /^Nord/ });
		expect(nordRow).toHaveAttribute('aria-pressed', 'true');
	});
});
