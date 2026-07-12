// Shared origin-private-file-system root accessor, used by every module that
// persists durable app state outside localStorage (link-store, sync session).

/**
 * @returns {Promise<FileSystemDirectoryHandle|null>} the OPFS root, or null when unavailable
 */
export async function opfsRoot() {
  try {
    const storage = globalThis.navigator?.storage
    return storage?.getDirectory ? await storage.getDirectory() : null
  }
  catch {
    return null
  }
}
