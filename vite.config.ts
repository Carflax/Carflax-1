import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Fixa a raiz na pasta do projeto (onde está o index.html), independentemente
  // do diretório de onde o Vite for lançado (ex.: a partir do monorepo pai).
  root: __dirname,
  plugins: [react()],
  resolve: {
    // Garante que todos os módulos (inclusive os carregados por alias/HMR) usem
    // a mesma instância de React. Sem isso, o dev server pode criar dispatchers
    // distintos e disparar "Invalid hook call" em componentes com hooks.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Pré-empacota o leaflet no startup para evitar re-otimização sob demanda
  // (que gerava 504 "Outdated Optimize Dep" ao instalar dep com o dev server no ar).
  optimizeDeps: {
    include: ['leaflet'],
  },
  server: {
    // Respeita a porta atribuída pelo ambiente (PORT); mantém 5173 no dev local.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api-marketing': {
        target: 'https://marketing-carflax.velbav.easypanel.host',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-marketing/, '')
      },
      '/api-campaign': {
        target: 'https://marketing-gestao-de-tempo.velbav.easypanel.host',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-campaign/, '')
      },
      '/secullum-auth': {
        target: 'https://autenticador.secullum.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/secullum-auth/, '')
      },
      '/secullum-api': {
        target: 'https://pontowebintegracaoexterna.secullum.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/secullum-api/, '')
      },
      '/supabase': {
        target: 'https://zwfvrmqffxcqurxpfewi.supabase.co',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/supabase/, '')
      },
      '/shopify-api': {
        target: 'https://gfpdzv-y0.myshopify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shopify-api/, '')
      }
    }
  }
})
