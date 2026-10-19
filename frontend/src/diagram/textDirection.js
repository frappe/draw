const MODES = new Set(["auto", "ltr", "rtl"]);
const AUTO_DIRECTION_CACHE = new Map();
const CACHE_LIMIT = 1024;

export function validDirection(value, { allowAuto = false } = {}) {
	const direction = typeof value === "string" ? value.toLowerCase() : null;
	return MODES.has(direction) && (allowAuto || direction !== "auto") ? direction : null;
}

export function validDirectionMode(value) {
	return validDirection(value, { allowAuto: true });
}

// Ask the browser's Unicode Bidirectional Algorithm for first-strong resolution.
// This keeps script coverage aligned with native dir="auto" without a second
// hand-maintained Unicode table in the export path.
export function resolveDirection(mode, text, fallback = "ltr") {
	const validMode = validDirectionMode(mode);
	if (validMode === "ltr" || validMode === "rtl") return validMode;
	const content = String(text || "");
	const cached = AUTO_DIRECTION_CACHE.get(content);
	if (cached) return cached;
	if (typeof document === "undefined" || !document.body) return fallback;

	const probe = document.createElement("span");
	probe.dir = "auto";
	probe.textContent = content;
	probe.style.cssText = "position:fixed;visibility:hidden;white-space:pre";
	document.body.append(probe);
	const direction = document.defaultView.getComputedStyle(probe).direction;
	probe.remove();
	const resolved = direction === "rtl" ? "rtl" : "ltr";
	if (AUTO_DIRECTION_CACHE.size >= CACHE_LIMIT) {
		AUTO_DIRECTION_CACHE.delete(AUTO_DIRECTION_CACHE.keys().next().value);
	}
	AUTO_DIRECTION_CACHE.set(content, resolved);
	return resolved;
}
