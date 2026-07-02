import { defineConfig } from 'vitest/config'

// Кореневий прогін `vitest run` без цього конфіга падав у дефолти:
// environment `node` (немає DOMParser для page-meta) і include, який
// підхоплював дублікати тестів із .worktrees/. Делегуємо у workspace-конфіги —
// кожен зі своїм environment, а їхні include-шляхи відносні до свого root,
// тож .worktrees/ поза прогоном.
export default defineConfig({
  test: {
    projects: ['app/vitest.config.js', 'scripts/vitest.config.js']
  }
})
