// The common theme tokens surfaced as friendly fields (the rest are set via theme CSS). Shared by
// the Inspector's "Theme tokens" group and the studio's Themes section — one set, two access points.
// Kept OUT of Inspector.tsx so that component file exports only its component: a mixed
// component + constant export makes React Fast Refresh bail ("TOKEN_FIELDS export is incompatible")
// and full-reload on every edit.
export const TOKEN_FIELDS = [
	{ key: '--np-accent', label: 'accent', ph: 'rgb(119, 196, 211)' },
	{ key: '--np-fg', label: 'text', ph: '#ffffff' },
	{ key: '--np-label', label: 'label', ph: 'rgb(218, 237, 226)' },
	{ key: '--np-track', label: 'track', ph: 'rgba(255, 255, 255, 0.15)' },
	{ key: '--np-font-display', label: 'font', ph: "'Bahnschrift', …" }
];
