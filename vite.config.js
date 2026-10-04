import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serves /api/trace from api/trace.js during `npm run dev` / `npm run preview`, so live tracing works
// locally the same way it does on Vercel. Put TRONGRID_API_KEY in a local .env file (never commit it).
function localApi(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  // (must return nothing: Vite treats a returned function as a post-middleware hook)
  const mount = (server) => {
    server.middlewares.use('/api/trace', async (req, res) => {
      const { default: handler } = await import('./api/trace.js')
      req.url = `/api/trace${req.url === '/' ? '' : req.url}`
      await handler(req, res, { env: { ...process.env, ...env } })
    })
  }
  return { name: 'raaz-local-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localApi(mode)],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
}))
