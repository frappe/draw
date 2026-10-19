const openSessions = new Map();

// Toolbar controls are a focus boundary even when they do not open a popover
// (for example, the font-size input). Keep this test independent of popover
// registration so pointer and keyboard focus transitions follow the same rule.
export function isTextEditingSurfaceTarget(target) {
	return (
		typeof Element !== "undefined" &&
		target instanceof Element &&
		Boolean(target.closest('[data-text-formatting-surface], [contenteditable="true"]'))
	);
}

export function openTextFormattingSurface(sessionId, surfaceId) {
	if (sessionId == null) return;
	let surfaces = openSessions.get(sessionId);
	if (!surfaces) {
		surfaces = new Set();
		openSessions.set(sessionId, surfaces);
	}
	surfaces.add(surfaceId);
}

export function closeTextFormattingSurface(sessionId, surfaceId) {
	const surfaces = openSessions.get(sessionId);
	if (!surfaces) return;
	surfaces.delete(surfaceId);
	if (!surfaces.size) openSessions.delete(sessionId);
}

export function hasOpenTextFormattingSurface(sessionId) {
	return openSessions.has(sessionId);
}
