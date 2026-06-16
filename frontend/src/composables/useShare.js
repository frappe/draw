// Sharing: global-access toggle + copy link (spec §9). Stub exposes the methods
// ShareMenu binds to; the feature agent wires the is_public toggle and link copy.
export function useShare(diagramResource) {
  return {
    toggleGlobalAccess: () => {},
    copyLink: () => {},
    diagramResource,
  }
}
