import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiOrigin = new URL(process.env.POTIBOT_ORIGIN || 'https://potibot.insanephin.xyz').origin
const versionName = (process.env.EXTENSION_VERSION || '0.0.1-dev').replace(/^v/, '')

const version = versionName.split(/[-+]/)[0]
if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error(`Invalid extension version: ${versionName}`)

const icon = 'icon/potibot.png'
const spotifyOrigin = 'https://open.spotify.com'

function manifest(): Plugin {
  return {
    name: 'potibot-extension-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(
          {
            manifest_version: 3,
            name: '포티봇',
            description: 'Spotify 대기열에 포티봇 신청곡과 신청자를 표시하고, 팝업에서 설정을 관리합니다.',
            version,
            version_name: versionName,
            minimum_chrome_version: '116',
            icons: { 16: icon, 48: icon, 128: icon },
            action: { default_title: '포티봇', default_icon: { 16: icon, 32: icon }, default_popup: 'popup.html' },
            background: { service_worker: 'background.js', type: 'module' },
            content_scripts: [{ matches: [`${spotifyOrigin}/*`], js: ['content.js'], run_at: 'document_idle' }],

            web_accessible_resources: [{ resources: [icon], matches: [`${spotifyOrigin}/*`] }],
            permissions: ['identity', 'storage'],
            host_permissions: [`${apiOrigin}/*`],
          },
          null,
          2,
        ),
      })
    },
  }
}

function classicContentScript(): Plugin {
  return {
    name: 'potibot-classic-content-script',
    generateBundle(_options, bundle) {
      const chunk = bundle['content.js']
      if (chunk?.type === 'chunk' && (chunk.imports.length > 0 || chunk.dynamicImports.length > 0)) {
        this.error(`content.js must not import other chunks: ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`)
      }
    },
  }
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'extension'),
  publicDir: path.resolve(import.meta.dirname, 'public'),
  plugins: [react(), tailwindcss(), manifest(), classicContentScript()],
  define: { __API_ORIGIN__: JSON.stringify(apiOrigin) },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-extension'),
    emptyOutDir: true,

    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: path.resolve(import.meta.dirname, 'extension/popup.html'),
        background: path.resolve(import.meta.dirname, 'extension/src/background.ts'),
        content: path.resolve(import.meta.dirname, 'extension/src/content.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' || chunk.name === 'content' ? `${chunk.name}.js` : 'assets/[name]-[hash].js',
      },
    },
  },
})
