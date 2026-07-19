// Зберігає вибір моделі omlx між сесіями (один рядок у localStorage).

export const STORAGE_KEY = 'myshare.omlxModel'

// Читає збережену модель. Повертає рядок або null.
/**
 * Читає збережену модель.
 *
 * @param {Storage} storage - Сховище браузера.
 * @returns {string|null} Збережена модель або null.
 */
export function loadModelPref(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null
  const raw = storage.getItem(STORAGE_KEY)
  return typeof raw === 'string' && raw ? raw : null
}

// Записує вибрану модель у localStorage.
/**
 * Записує вибрану модель у сховище браузера.
 *
 * @param {string} model - Назва моделі.
 * @param {Storage} storage - Сховище браузера.
 */
export function saveModelPref(model, storage) {
  if (!storage || typeof storage.setItem !== 'function') return
  if (typeof model === 'string' && model) {
    storage.setItem(STORAGE_KEY, model)
  }
}
