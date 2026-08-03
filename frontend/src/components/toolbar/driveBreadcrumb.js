// Pure decision behind the editor toolbar's Drive-path breadcrumb (#112): given the
// backend's diagram_drive_path response, return the folder crumbs to render BEFORE the
// editable title, or [] to fall back to the static "Frappe Draw" crumb.
//
// The soft-coupling lives here — a null response (Drive absent / the call errored), an
// unregistered diagram, or an empty/malformed path all collapse to [], so the toolbar
// never breaks when Drive is missing. Kept out of the SFC so it can be unit-tested
// without mounting the component.
export function driveBreadcrumbCrumbs(res) {
  if (!res || res.registered !== true || !Array.isArray(res.path)) return []
  return res.path.filter((crumb) => crumb && crumb.name && crumb.title)
}
