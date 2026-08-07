import './frappeui.js' // must run before any resource is created
import { createApp } from 'vue'
import { FrappeUI } from 'frappe-ui'
import App from './App.vue'
import { router } from './router.js'
import './index.css'

const app = createApp(App)
app.use(router)
// window.socketio_port comes from the boot payload (draw/www/draw.py) — without
// it frappe-ui's socket client falls back to its hardcoded default of 9000,
// which polls forever on any bench whose site isn't on that port (#177).
app.use(FrappeUI, { socketio: { port: window.socketio_port } })
app.mount('#app')
