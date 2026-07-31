// Named sections/frames (spec: available in EVERY diagram type). A section is a
// document-level object (like shapes/connectors) — a titled rectangle that groups
// content. It renders behind everything and never owns the content inside it; it's
// purely a visual grouping you can move, resize, rename and delete.
//
// The tool that DREW new sections left the toolbar in #42, so there is no factory
// here any more — only what rendering an existing section needs.

export const SECTION_HEADER_H = 26
