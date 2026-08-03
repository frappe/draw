// The landing logic behind the `/new` route (#105): create a fresh unified
// diagram the normal client-side way, optionally drop it into a Drive folder, and
// open its editor. Kept out of the component so it's unit-testable without mounting.
import { createDiagram } from '@/data/diagrams.js'
import { moveToDriveFolder } from '@/data/drive.js'

// Create a new unified diagram and navigate to its editor, returning the new name.
// When `parent` (a Drive folder id) is given, best-effort move the file into that
// folder first — a Drive move failure must NOT block opening the diagram (it still
// exists, in Drive Home), so it's logged and swallowed. Navigation uses `replace`
// so Back doesn't return to /new and create a second diagram. `new: '1'` selects
// the title for inline renaming on the fresh canvas, matching Home's create flow.
export async function createAndOpenDiagram(router, parent = null) {
  const name = await createDiagram(undefined, null, 'unified', null)
  if (!name) throw new Error('Server returned no diagram name')
  if (parent) {
    try {
      await moveToDriveFolder(name, parent)
    } catch (error) {
      console.error('Move new diagram to Drive folder failed:', error)
    }
  }
  router.replace({ name: 'Editor', params: { name }, query: { new: '1' } })
  return name
}
