// Pure decision for leaving the widget designer when the user picks another studio section (a nav-rail
// icon) while a widget def is open. Mirrors decideStudioClose (closePrompt.ts): a native confirm keeps
// the studio's window.confirm style instead of a custom modal, and the logic is unit-testable without a
// window (AGENTS.md §4). The rail used to be a dead modal here (clicks no-opped, which read as broken);
// now a click leaves the designer instead. A read-only template preview and an unedited def have nothing
// to lose, so they leave without asking; only an edited def prompts (leaving runs Done, which saves it).

export type DesignerLeaveAction = 'leave' | 'stay';

export const designerLeavePrompt = (name: string) =>
	`Save your changes to the widget "${name}" and leave the designer?`;

/**
 * Decide what to do when a studio nav section is chosen while the widget designer is open.
 * - `previewing` (read-only) or no unsaved edits → `leave` (no prompt; Done folds an identical def back
 *   and a preview is simply discarded).
 * - Unsaved def edits → confirm: yes → `leave` (Done saves), no → `stay` (keep editing).
 */
export function decideDesignerLeave(
	opts: { previewing: boolean; dirty: boolean; name: string },
	confirm: (message: string) => boolean
): DesignerLeaveAction {
	if (opts.previewing || !opts.dirty) return 'leave';
	return confirm(designerLeavePrompt(opts.name)) ? 'leave' : 'stay';
}
