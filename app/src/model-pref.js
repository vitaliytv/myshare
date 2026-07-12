// Зберігає вибір моделі omlx між сесіями (один рядок у localStorage).

export const STORAGE_KEY = 'myshare.omlxModel'

// Читає збережену модель. Повертає рядок або null.
/**
 *
 */
export function loadModelPref(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null
  const raw = storage.getItem(STORAGE_KEY)
  return typeof raw === 'string' && raw ? raw : null
}

// Записує вибрану модель у localStorage.
/**
 *
 */
export function saveModelPref(model, storage) {
  if (!storage || typeof storage.setItem !== 'function') return
  if (typeof model === 'string' && model) {
    storage.setItem(STORAGE_KEY, model)
  }
}
