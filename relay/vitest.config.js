import { defineConfig } from 'vitest/config'

export default defineConfig({
  // `bun:sqlite` is a Bun built-in, not something Vite's resolver knows about
  // (unlike `node:*`, which it passes through automatically) — mark it external
  // so the import statement reaches the runtime unchanged. Only works when the
  // process actually executing tests is Bun (`bun run test`, not plain `vitest`
  // under Node), since Bun is what natively provides `bun:sqlite`.
  plugins: [
    {
      name: 'bun-builtin-passthrough',
      resolveId(id) {
        if (id.startsWith('bun:')) return { id, external: true }
      }
    }
  ],
  test: {
    include: ['**/*.test.{js,mjs}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    pool: 'forks'
  }
})
