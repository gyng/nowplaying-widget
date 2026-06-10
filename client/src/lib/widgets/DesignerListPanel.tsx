// Widget-designer section (extracted from Canvas): the library widget list (edit/rename/clone/
// delete), the template list (preview/clone), the AI-handoff "copy widget reference" button, and
// the empty-state explainer shown when no def is open. The def-edit actions live in Canvas
// (canvas/useDefEditor) and arrive as one grouped prop. Lazy-loaded like the other studio panels.
import { TEMPLATES } from '../core/templates';
import type { Library } from '../core/layoutTree';
import { listMetas } from '../core/widget';
import { widgetReferenceMarkdown } from '../core/widgetDocs';
import { copyToClipboard } from '../overlay';
import type { DefEditor } from './canvas/useDefEditor';

type Props = {
	library: Library | undefined;
	editingDefId: string | null;
	/** The previewed template's name (read-only preview), to highlight its row. Null = none. */
	previewName: string | null;
	/** Whether a def/preview is open on the design canvas (hides the empty-state explainer). */
	designing: boolean;
	actions: Pick<
		DefEditor,
		| 'startNewWidget'
		| 'openExistingDef'
		| 'renameWidget'
		| 'cloneDefToEdit'
		| 'deleteWidget'
		| 'previewTemplate'
		| 'newFromTemplate'
	>;
};

export default function DesignerListPanel({
	library,
	editingDefId,
	previewName,
	designing,
	actions
}: Props) {
	return (
		<>
			<div className="designer-list">
				<button type="button" className="dl-new" onClick={actions.startNewWidget}>
					＋ New widget
				</button>
				<button
					type="button"
					className="dl-ref"
					title="Copy a Markdown reference of every widget type + its config schema — for handing to an AI assistant"
					onClick={async () => {
						const md = widgetReferenceMarkdown(listMetas());
						const ok = await copyToClipboard(md);
						if (!ok) console.log(md);
						window.alert(
							ok
								? 'Widget reference (Markdown) copied — paste it to the assistant.'
								: 'Copy failed; the reference was logged to the devtools console.'
						);
					}}
				>
					⧉ Copy widget reference
				</button>
				<div className="rp-hd">Widgets</div>
				{library?.defs.length ? (
					<div className="dl-items">
						{library.defs.map((d) => (
							<div
								key={d.id}
								className={['dl-item', d.id === editingDefId && 'cur'].filter(Boolean).join(' ')}
							>
								<button
									type="button"
									className="dl-label"
									title="Edit this widget"
									onClick={() => actions.openExistingDef(d.id)}
								>
									{d.name}
								</button>
								<button
									type="button"
									className="dl-icon"
									title="Rename widget"
									onClick={() => actions.renameWidget(d.id, d.name)}
								>
									✎
								</button>
								<button
									type="button"
									className="dl-icon"
									title="Clone to a new widget"
									onClick={() => actions.cloneDefToEdit(d.id)}
								>
									⎘
								</button>
								<button
									type="button"
									className="dl-icon dl-del"
									title="Delete widget"
									onClick={() => actions.deleteWidget(d.id, d.name)}
								>
									✕
								</button>
							</div>
						))}
					</div>
				) : (
					<div className="rp-stub">No widgets yet — ＋ New, or clone a template.</div>
				)}
				<div className="rp-hd">Templates</div>
				<div className="dl-items">
					{TEMPLATES.map((t) => (
						<div
							key={t.id}
							className={['dl-item', previewName === t.name && 'cur'].filter(Boolean).join(' ')}
						>
							<button
								type="button"
								className="dl-label"
								title={`${t.description} — click to preview (read-only)`}
								onClick={() => actions.previewTemplate(t.id)}
							>
								{t.name}
							</button>
							<button
								type="button"
								className="dl-icon"
								title="Clone into a new editable library widget — instances keep the template's options as params (the Layouts Add palette inserts standalone copies instead)"
								onClick={() => actions.newFromTemplate(t.id)}
							>
								⎘
							</button>
						</div>
					))}
				</div>
			</div>
			{!designing && (
				<div className="designer-empty">
					<div className="de-title">Widget designer</div>
					<div className="de-hint">
						Build a reusable <strong>widget type</strong> — its inner layout, sensors, and styling —
						once, then drop copies of it onto any monitor.
						<br />
						<br />
						Pick a widget on the left to edit, clone a template, or ＋&nbsp;New widget to start from
						scratch.
						<br />
						<br />
						Just placing a meter (CPU, clock, …) on your desktop? That’s the{' '}
						<strong>Layouts</strong> section — pick a spot, then use the “Add” palette.
					</div>
				</div>
			)}
		</>
	);
}
