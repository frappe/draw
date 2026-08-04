// Comment text is stored as plain text with @mentions encoded as `@[Full Name](id)`
// tokens (the same shape the backend parses to notify a mentioned user). Nothing
// here emits HTML — the segments render through Vue's text interpolation, so a
// comment can never inject markup into another viewer's DOM. Kept Vue-free so it is
// unit-testable (CONVENTIONS).

// One @mention token: @[Label](user@example.com). The label is display sugar; only
// the id in the parentheses is the user. Global + non-greedy so several mentions in
// one comment each parse on their own.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g

// Split a comment body into an ordered list of segments for rendering:
//   { type: 'text', value }      — a run of plain text
//   { type: 'mention', id, label } — a resolved @mention
// Adjacent text is preserved verbatim (whitespace and newlines included).
export function parseComment(content) {
  const text = String(content || '')
  const segments = []
  let lastIndex = 0
  // Reset lastIndex: the regex is stateful (the /g flag), and this module shares one.
  MENTION_RE.lastIndex = 0
  let match
  while ((match = MENTION_RE.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'mention', label: match[1], id: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

// The mention token to splice into the composed text for a chosen user. `label`
// defaults to the id so a user with no full name still reads sensibly.
export function buildMentionToken(user) {
  const id = user?.name || user?.id || ''
  const label = user?.full_name || user?.label || id
  return `@[${label}](${id})`
}

// A one-line plain preview (mention tokens collapse to "@Label", newlines to
// spaces) for the side panel's thread summary. Never rendered as HTML.
export function commentPreview(content) {
  return String(content || '')
    .replace(MENTION_RE, (_, label) => `@${label}`)
    .replace(/\s+/g, ' ')
    .trim()
}

// The user ids @mentioned in a body — the client-side mirror of the backend parse,
// used to avoid re-mentioning someone already picked and for tests.
export function mentionedIds(content) {
  const ids = []
  MENTION_RE.lastIndex = 0
  let match
  while ((match = MENTION_RE.exec(String(content || '')))) ids.push(match[2])
  return ids
}
