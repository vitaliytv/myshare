<script setup>
import { extractSharedUrl } from './shared-url.js'
import { appendUrlToHistory, loadUrlHistory, saveUrlHistory } from './url-history.js'
import { fetchPageMeta } from './page-meta.js'

const urlHistory = ref([])
// reactive map url → { title, favicon, loading, error }
// окрема reactive, бо ми мутуємо ключі поштучно (Vue 3 ref({}) це підтримує).
const metaByUrl = ref({})

// Фетчить metadata для url якщо ще не починали; кешує у metaByUrl.
// Не throws — помилку зберігаємо у meta.error, щоб UI міг показати fallback.
async function ensureMeta(url) {
  if (metaByUrl.value[url]) return
  metaByUrl.value[url] = { title: '', favicon: '', loading: true, error: '' }
  try {
    const { title, favicon } = await fetchPageMeta(url)
    metaByUrl.value[url] = { title, favicon, loading: false, error: '' }
  } catch (e) {
    metaByUrl.value[url] = { title: '', favicon: '', loading: false, error: String(e?.message ?? e) }
  }
}

function handleAndroidShare(event) {
  const text = typeof event.detail?.text === 'string' ? event.detail.text : ''
  const url = extractSharedUrl(text)
  if (!url) return

  urlHistory.value = appendUrlToHistory(urlHistory.value, url)
  saveUrlHistory(window.localStorage, urlHistory.value)
  ensureMeta(url)
}

onMounted(() => {
  urlHistory.value = loadUrlHistory(window.localStorage)
  // Пiсля cold-start — підтягуємо metadata для всіх збережених URL.
  for (const url of urlHistory.value) ensureMeta(url)
  window.addEventListener('myshare:android-share', handleAndroidShare)
})

onUnmounted(() => {
  window.removeEventListener('myshare:android-share', handleAndroidShare)
})
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="column items-center q-pa-lg">
        <q-card class="share-card" flat bordered>
          <q-card-section class="text-center">
            <div class="text-h4 q-mb-sm">myshare</div>
            <div class="text-body1 text-grey-7">Приймає посилання через Android Share</div>
          </q-card-section>

          <q-separator />

          <q-card-section v-if="urlHistory.length">
            <div class="text-overline text-grey-7 q-mb-sm">Прийняті посилання</div>
            <q-list separator>
              <q-item
                v-for="(url, index) in urlHistory"
                :key="`${index}:${url}`"
                clickable
                :href="url"
                target="_blank"
                rel="noreferrer"
                tag="a">
                <q-item-section avatar>
                  <q-spinner
                    v-if="metaByUrl[url]?.loading"
                    color="primary"
                    size="32px" />
                  <q-avatar v-else size="32px" rounded>
                    <q-img
                      v-if="metaByUrl[url]?.favicon"
                      :src="metaByUrl[url].favicon"
                      :ratio="1"
                      no-spinner
                      @error="metaByUrl[url].favicon = ''">
                      <template #error>
                        <q-icon name="sym_o_link" color="grey-6" />
                      </template>
                    </q-img>
                    <q-icon v-else name="sym_o_link" color="grey-6" />
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label lines="2">
                    {{ metaByUrl[url]?.title || url }}
                  </q-item-label>
                  <q-item-label v-if="metaByUrl[url]?.title" caption class="shared-url">
                    {{ url }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>

          <q-card-section v-else class="text-center">
            <div class="text-body2 text-grey-7">
              Натисни <strong>Share</strong> для посилання в іншому Android-застосунку й вибери
              <strong>myshare</strong>.
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.share-card {
  max-width: 640px;
  width: 100%;
}

.shared-url {
  overflow-wrap: anywhere;
}
</style>
