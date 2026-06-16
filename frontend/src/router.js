import { createRouter, createWebHistory } from 'vue-router'
import HomeShell from '@/pages/HomeShell.vue'
import EditorShell from '@/pages/EditorShell.vue'
import ViewerPage from '@/components/viewer/ViewerPage.vue'

const routes = [
  { path: '/', name: 'Home', component: HomeShell },
  { path: '/d/:name', name: 'Editor', component: EditorShell, props: true },
  { path: '/view/:name', name: 'Viewer', component: ViewerPage, props: true },
]

export const router = createRouter({
  history: createWebHistory('/frappe_draw'),
  routes,
})
