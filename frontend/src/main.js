import './frappeui.js' // must run before any resource is created
import { createApp } from 'vue'
import { FrappeUI } from 'frappe-ui'
import App from './App.vue'
import { router } from './router.js'
import './index.css'
// Apply persisted app settings (e.g. dark mode → data-theme on <html>) before
// mount so the theme is correct on first paint, on every page.
import './composables/useAppSettings.js'

const app = createApp(App)
app.use(router)
app.use(FrappeUI)
app.mount('#app')
