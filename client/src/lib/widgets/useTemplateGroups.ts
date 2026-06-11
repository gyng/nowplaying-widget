// React binding for the core template registry: re-renders the palette / designer list when a
// template group registers or unregisters (a plugin package being toggled). listTemplateGroups
// caches its snapshot identity, so useSyncExternalStore only re-renders on real changes.
import { useSyncExternalStore } from 'react';
import { listTemplateGroups, subscribeTemplates, type TemplateGroup } from '../core/templates';

export function useTemplateGroups(): TemplateGroup[] {
	return useSyncExternalStore(subscribeTemplates, listTemplateGroups);
}
