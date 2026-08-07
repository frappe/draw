import { createRouter, createWebHistory } from 'vue-router'
import HomeShell from '@/pages/HomeShell.vue'
import EditorPage from '@/pages/EditorPage.vue'
import NewDiagramRedirect from '@/pages/NewDiagramRedirect.vue'
import ViewerPage from '@/components/viewer/ViewerPage.vue'

const routes = [
  { path: '/', name: 'Home', component: HomeShell },
  // Create-and-open landing (#105): Drive's "+ Create → Diagram" navigates here,
  // optionally with ?parent=<driveFolderId> to file the new diagram in that folder.
  { path: '/new', name: 'NewDiagram', component: NewDiagramRedirect },
  { path: '/d/:name', name: 'Editor', component: EditorPage, props: true },
  { path: '/view/:name', name: 'Viewer', component: ViewerPage, props: true },
]

export const router = createRouter({
  history: createWebHistory('/draw'),
  routes,
})
