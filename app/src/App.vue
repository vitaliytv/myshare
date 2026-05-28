<script setup>
import { extractSharedUrl } from './shared-url.js'
import { appendUrlToHistory, loadUrlHistory, saveUrlHistory } from './url-history.js'
import { fetchPageMeta } from './page-meta.js'
import { isAndroidPlatform } from './platform.js'
import { extractYoutubeVideoId, findYoutubeCaption, fetchCaptionText } from './youtube.js'

// На Android користувач отримує URL через справжній Share intent (MainActivity →
// CustomEvent). На desktop dev share intent'у нема — показуємо input як helper,
// що віддає той самий event і прогоняє його handleAndroidShare.
const showShareHelper = !isAndroidPlatform()
const helperInput = ref('')

const urlHistory = ref([])
// reactive map url → { title, favicon, loading, error }
const metaByUrl = ref({})
// reactive map url → { videoId, caption: {languageCode,name,baseUrl,isAuto}|null, loading, error }
// caption=null означає, що ми перевірили — субтитрів uk/en нема. loading=true поки fetch'аємо.
const youtubeByUrl = ref({})

// Пріоритет мов для субтитрів: спершу українська (manual > auto), потім англійська.
const PREFERRED_CAPTION_LANGS = ['uk', 'en']

// Фетчить metadata для url якщо ще не починали; кешує у metaByUrl.
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

// Якщо URL це YouTube — фетчить caption tracks, вибирає uk→en, кешує.
// Для не-YouTube URL нічого не робить (youtubeByUrl[url] лишається undefined,
// UI просто не показує кнопку субтитрів).
async function ensureYoutube(url) {
  if (youtubeByUrl.value[url]) return
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) return
  youtubeByUrl.value[url] = { videoId, caption: null, loading: true, error: '' }
  try {
    const caption = await findYoutubeCaption(videoId, PREFERRED_CAPTION_LANGS)
    youtubeByUrl.value[url] = { videoId, caption, loading: false, error: '' }
  } catch (e) {
    youtubeByUrl.value[url] = { videoId, caption: null, loading: false, error: String(e?.message ?? e) }
  }
}

function handleAndroidShare(event) {
  const text = typeof event.detail?.text === 'string' ? event.detail.text : ''
  const url = extractSharedUrl(text)
  if (!url) return

  urlHistory.value = appendUrlToHistory(urlHistory.value, url)
  saveUrlHistory(window.localStorage, urlHistory.value)
  ensureMeta(url)
  ensureYoutube(url)
}

function submitShareHelper() {
  const text = helperInput.value.trim()
  if (!text) return
  handleAndroidShare({ detail: { text } })
  helperInput.value = ''
}

// --- Subtitle dialog ---------------------------------------------------------
const captionDialog = ref({
  open: false,
  title: '', // заголовок діалогу (title сторінки + мова)
  text: '',
  loading: false,
  error: ''
})

async function openCaptionDialog(url) {
  const yt = youtubeByUrl.value[url]
  if (!yt?.caption) return
  captionDialog.value = {
    open: true,
    title: buildCaptionDialogTitle(url, yt.caption),
    text: '',
    loading: true,
    error: ''
  }
  try {
    const text = await fetchCaptionText(yt.caption)
    captionDialog.value = { ...captionDialog.value, text, loading: false }
  } catch (e) {
    captionDialog.value = { ...captionDialog.value, loading: false, error: String(e?.message ?? e) }
  }
}

function buildCaptionDialogTitle(url, caption) {
  const meta = metaByUrl.value[url]
  const head = meta?.title || url
  const langTag = caption.isAuto ? `${caption.languageCode} (auto)` : caption.languageCode
  return `${head} — субтитри ${langTag}`
}

// --- Lifecycle ---------------------------------------------------------------
onMounted(() => {
  urlHistory.value = loadUrlHistory(window.localStorage)
  for (const url of urlHistory.value) {
    ensureMeta(url)
    ensureYoutube(url)
  }
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

          <q-card-section v-if="showShareHelper" class="q-pt-none">
            <q-input
              v-model="helperInput"
              dense
              outlined
              placeholder="Вставити URL для симуляції share"
              @keyup.enter="submitShareHelper">
              <template #append>
                <q-btn
                  flat
                  dense
                  color="primary"
                  icon="sym_o_send"
                  :disable="!helperInput.trim()"
                  @click="submitShareHelper" />
              </template>
            </q-input>
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
                <q-item-section v-if="youtubeByUrl[url]" side>
                  <!-- click.prevent.stop — q-item сам по собі лінк, не даємо batsi -->
                  <q-spinner v-if="youtubeByUrl[url].loading" color="primary" size="20px" />
                  <q-btn
                    v-else-if="youtubeByUrl[url].caption"
                    flat
                    dense
                    color="primary"
                    icon="sym_o_subtitles"
                    :label="
                      youtubeByUrl[url].caption.isAuto
                        ? `${youtubeByUrl[url].caption.languageCode} (auto)`
                        : youtubeByUrl[url].caption.languageCode
                    "
                    @click.prevent.stop="openCaptionDialog(url)" />
                  <q-icon v-else name="sym_o_subtitles_off" color="grey-6" :title="youtubeByUrl[url].error" />
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

        <!-- Модалка перегляду субтитрів -->
        <q-dialog v-model="captionDialog.open">
          <q-card class="caption-dialog">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-subtitle1 ellipsis-3-lines">{{ captionDialog.title }}</div>
              <q-space />
              <q-btn icon="sym_o_close" flat round dense v-close-popup />
            </q-card-section>

            <q-card-section>
              <div v-if="captionDialog.loading" class="text-center q-py-md">
                <q-spinner color="primary" size="40px" />
              </div>
              <div v-else-if="captionDialog.error" class="text-negative">
                Не вдалося завантажити субтитри: {{ captionDialog.error }}
              </div>
              <pre v-else class="caption-text">{{ captionDialog.text }}</pre>
            </q-card-section>
          </q-card>
        </q-dialog>
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

.caption-dialog {
  width: 100%;
  max-width: 720px;
}

.caption-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.45;
  max-height: 70vh;
  overflow-y: auto;
  margin: 0;
}
</style>
