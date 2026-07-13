import { getConfig } from '@nitra/eslint-config'

export default [
  {
    ignores: [
      '**/auto-imports.d.ts',
      '**/reports/stryker/**',
      '.claude/worktrees/**',
      'app/src-tauri/**',
      'app/dist/**',
      'docs/**'
    ]
  },
  ...getConfig({
    node: ['scripts', 'relay'],
    vue: ['app']
  }),
  // `relay/` runs under Bun, not plain Node — add the one extra global `Bun`
  // (console/process already come from getConfig's `node: [...]` globals.node).
  {
    files: ['relay/**/*.js'],
    languageOptions: {
      globals: { Bun: 'readonly' }
    }
  }
]
