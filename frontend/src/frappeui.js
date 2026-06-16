// frappe-ui global configuration. Imported before any module that creates
// resources, so every resource call routes through frappeRequest
// (/api/method/... with CSRF + site headers).

import { setConfig, frappeRequest } from 'frappe-ui'

setConfig('resourceFetcher', frappeRequest)
