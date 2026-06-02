// The single editor-operation message both the Inspector and the Outline dispatch up to
// the Canvas (which holds the layout state and applies it via core/layoutEdit). One
// discriminated union keeps the wiring flat — Canvas has one `handleOp` switch.

import type { Container, Group, WidgetInstance } from '../core/layoutTree';

export type LayoutOp =
	| { op: 'select'; id: string }
	| { op: 'addWidget'; widgetType: string }
	| { op: 'addContainer'; kind: 'row' | 'col' | 'grid' }
	| { op: 'remove'; id: string }
	| { op: 'moveUp'; id: string }
	| { op: 'moveDown'; id: string }
	| { op: 'outdent'; id: string } // move out to the grandparent
	| { op: 'indent'; id: string } // move into the previous sibling container
	| { op: 'dock'; id: string } // floating → flow (into root)
	| { op: 'float'; id: string } // flow leaf → floating
	| { op: 'makeWidget'; id: string } // wrap a node into a reusable group + def (6a)
	| { op: 'ungroup'; id: string } // inline a group back to its subtree (6a)
	| { op: 'insertWidget'; defId: string } // instantiate a library def as a new group (6d)
	| { op: 'renameDef'; defId: string; name: string } // rename a library def (6d)
	| { op: 'deleteDef'; defId: string } // remove a library def if unused (6d)
	| { op: 'addDefParam'; defId: string; key: string; target?: string } // declare a param (6c)
	| { op: 'editDef'; defId: string } // enter the scoped def editor (6b)
	| { op: 'endDefEdit' } // leave the def editor, saving back (6b)
	| { op: 'setDefSize'; defId: string; w: number; h: number } // resize a def's box (6b)
	| { op: 'patchGroup'; id: string; patch: Partial<Group> } // group name / params / css
	| { op: 'setDefCss'; defId: string; css: string } // a def's css (7d)
	| { op: 'setToken'; key: string; value: string } // a global token override (7d, '' clears)
	| { op: 'patchWidget'; id: string; patch: Partial<WidgetInstance> }
	| { op: 'patchContainer'; id: string; patch: Partial<Container> };
