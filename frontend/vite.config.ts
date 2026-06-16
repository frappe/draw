import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(async () => {
  const { default: frappeui } = await import('frappe-ui/vite')

  return {
    plugins: [
      frappeui({
        frontendRoute: '/frappe_draw',
        frappeTypes: {
          input: {
            frappe_draw: ['draw_diagram', 'draw_folder'],
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
  }
})
