import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(async () => {
  const { default: frappeui } = await import('frappe-ui/vite')

  return {
    plugins: [
      frappeui({
        frontendRoute: '/draw',
        // Explicit build paths so the SPA builds without a surrounding Frappe
        // bench (e.g. CI, a standalone `git clone`). Paths are relative to this
        // frontend/ dir; the Python package sits at ../draw. Without these the
        // plugin tries to infer the app name from bench config and fails with
        // "indexHtmlPath is required in buildConfig options".
        buildConfig: {
          outDir: '../draw/public/frontend',
          indexHtmlPath: '../draw/www/draw.html',
          baseUrl: '/assets/draw/frontend/',
        },
        frappeTypes: {
          input: {
            draw: ['draw_diagram', 'draw_folder'],
          },
        },
      }),
      vue(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    // frappe-ui 1.0 ships source that references ~icons/lucide/* virtual modules
    // (resolved by frappe-ui/vite's plugin in the transform pipeline). Excluding
    // it from esbuild dep pre-bundling lets that source flow through the plugin
    // so the dev scanner doesn't error on the unresolved ~icons imports.
    optimizeDeps: {
      exclude: ['frappe-ui'],
    },
  }
})
