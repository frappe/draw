import './frappeui.js' // must run before any resource is created
import { createApp } from 'vue'
import { FrappeUI } from 'frappe-ui'
import App from './App.vue'
import { router } from './router.js'
import './index.css'

const app = createApp(App)
app.use(router)
app.use(FrappeUI)
app.mount('#app')
