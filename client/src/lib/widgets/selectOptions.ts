// Pure helpers for the shared <Select> control (kept out of the component so the matching/typeahead
// logic is unit-testable without a DOM). An option's `value` is what's stored; `label` is shown; the
// optional `hint` is dim secondary text (e.g. a sensor's raw id next to its friendly name).

export type SelectOption = {
	value: string;
	label: string;
	hint?: string;
	disabled?: boolean;
};

/**
 * Case-insensitive typeahead filter over label + value + hint. An empty/blank query returns every
 * option (original order preserved), so opening the menu shows the full list.
 */
export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
	const q = query.trim().toLowerCase();
	if (!q) return options;
	return options.filter(
		(o) =>
			o.label.toLowerCase().includes(q) ||
			o.value.toLowerCase().includes(q) ||
			(o.hint?.toLowerCase().includes(q) ?? false)
	);
}

/** The option matching a stored value, or null. */
export function optionFor(options: SelectOption[], value: string): SelectOption | null {
	return options.find((o) => o.value === value) ?? null;
}

/**
 * What a combobox input shows for the current value. In free-text mode (`allowCustom`, e.g. sensors)
 * the raw value is shown so a typed-but-unlisted id stays visible; otherwise the matched option's
 * label (empty when nothing is selected yet).
 */
export function displayValue(options: SelectOption[], value: string, allowCustom: boolean): string {
	if (allowCustom) return value;
	return optionFor(options, value)?.label ?? '';
}
