import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_TIMEOUT_MS = 4500

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = String(env.GROQ_API_KEY || '').trim()

  const proxyConfig = key
    ? {
        '/api/groq': {
          target: GROQ_ENDPOINT,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/groq/, ''),
          headers: {
            Authorization: `Bearer ${key}`,
          },
          timeout: GROQ_TIMEOUT_MS,
        },
      }
    : undefined

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: {
      middlewareMode: false,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    },
    preview: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    },
  }
})
