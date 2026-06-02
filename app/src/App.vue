<script setup>
import { extractSharedUrl } from './shared-url.js'
import { appendUrlToHistory, loadUrlHistory, saveUrlHistory } from './url-history.js'
import { fetchPageMeta } from './page-meta.js'
import { isAndroidPlatform } from './platform.js'
import { extractYoutubeVideoId, getYoutubeTranscript, getYoutubeLanguages } from './youtube.js'
import { captionStatus, loadLangsCache, saveLangsCache } from './caption-langs.js'

// На Android користувач отримує URL через справжній Share intent (MainActivity →
// CustomEvent). На desktop dev share intent'у нема — показуємо input як helper,
// що віддає той самий event і прогоняє його handleAndroidShare.
const showShareHelper = !isAndroidPlatform()
const helperInput = ref('')

const urlHistory = ref([])
// reactive map url → { title, favicon, loading, error }
const metaByUrl = ref({})
// reactive map url → { videoId, langsLoading, langsError, status } для YouTube
// URL. Одразу після появи лінку підтягуємо список мов субтитрів (один запит до
// supadata, кешований у localStorage за videoId) і показуємо статус: чи є
// українські, чи англійські. Сам транскрипт фетчимо лише при тапі.
const youtubeByUrl = ref({})

// Пріоритет мов для субтитрів: спершу українська, потім англійська.
const PREFERRED_CAPTION_LANGS = ['uk', 'en']

// Кеш videoId → доступні мови (живе у localStorage, щоб не палити квоту
// supadata на повторні запити того самого відео).
const langsCache = ref({})

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

// Помічає YouTube URL у `youtubeByUrl`, щоб UI показав кнопку, і підтягує
// статус наявності субтитрів (uk → en). Сам транскрипт не фетчимо до тапу.
function ensureYoutube(url) {
  if (youtubeByUrl.value[url]) return
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) return
  youtubeByUrl.value[url] = { videoId, langsLoading: false, langsError: '', status: null }
  ensureCaptionLangs(url, videoId)
}

// Визначає доступні мови субтитрів для videoId і записує статус у
// `youtubeByUrl[url]`. Бере з localStorage-кешу, якщо вже питали це відео;
// інакше робить один запит до supadata й кешує результат.
async function ensureCaptionLangs(url, videoId) {
  const cached = langsCache.value[videoId]
  if (cached) {
    youtubeByUrl.value[url] = { ...youtubeByUrl.value[url], status: captionStatus(cached) }
    return
  }
  youtubeByUrl.value[url] = { ...youtubeByUrl.value[url], langsLoading: true, langsError: '' }
  try {
    const langs = await getYoutubeLanguages(videoId)
    langsCache.value = { ...langsCache.value, [videoId]: langs }
    saveLangsCache(window.localStorage, langsCache.value)
    youtubeByUrl.value[url] = {
      ...youtubeByUrl.value[url],
      langsLoading: false,
      status: captionStatus(langs)
    }
  } catch (e) {
    youtubeByUrl.value[url] = {
      ...youtubeByUrl.value[url],
      langsLoading: false,
      langsError: String(e?.message ?? e)
    }
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
  if (!yt?.videoId) return
  const baseTitle = metaByUrl.value[url]?.title || url
  captionDialog.value = {
    open: true,
    title: `${baseTitle} — субтитри`,
    text: '',
    loading: true,
    error: ''
  }
  try {
    const { languageCode, text } = await getYoutubeTranscript(yt.videoId, PREFERRED_CAPTION_LANGS)
    captionDialog.value = {
      ...captionDialog.value,
      title: `${baseTitle} — субтитри ${languageCode}`,
      text,
      loading: false
    }
  } catch (e) {
    captionDialog.value = { ...captionDialog.value, loading: false, error: String(e?.message ?? e) }
  }
}

// --- Lifecycle ---------------------------------------------------------------
onMounted(() => {
  langsCache.value = loadLangsCache(window.localStorage)
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
              <!-- q-item НЕ є лінком (немає :href + tag="a"), щоб кнопка субтитрів
                   могла надійно обробляти клік. Лінк перенесений в окремий <a>
                   всередині основної секції — клік по title/url відкриває URL у
                   браузері, клік по кнопці субтитрів — модалку. -->
              <q-item v-for="(url, index) in urlHistory" :key="`${index}:${url}`">
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
                  <a :href="url" target="_blank" rel="noreferrer" class="url-link">
                    <q-item-label lines="2">
                      {{ metaByUrl[url]?.title || url }}
                    </q-item-label>
                    <q-item-label v-if="metaByUrl[url]?.title" caption class="shared-url">
                      {{ url }}
                    </q-item-label>
                  </a>
                </q-item-section>
                <q-item-section v-if="youtubeByUrl[url]" side class="yt-side">
                  <!-- Статус наявності субтитрів: uk → en → нема. -->
                  <q-spinner
                    v-if="youtubeByUrl[url].langsLoading"
                    color="primary"
                    size="20px" />
                  <q-chip
                    v-else-if="youtubeByUrl[url].status?.kind === 'uk'"
                    dense
                    square
                    color="green-2"
                    text-color="green-9"
                    icon="sym_o_subtitles"
                    title="Доступні українські субтитри">
                    🇺🇦 UA
                  </q-chip>
                  <q-chip
                    v-else-if="youtubeByUrl[url].status?.kind === 'en'"
                    dense
                    square
                    color="blue-2"
                    text-color="blue-9"
                    icon="sym_o_subtitles"
                    title="Українських нема — доступні англійські">
                    🇬🇧 EN
                  </q-chip>
                  <q-chip
                    v-else-if="youtubeByUrl[url].status?.kind === 'none'"
                    dense
                    square
                    color="grey-3"
                    text-color="grey-8"
                    icon="sym_o_subtitles_off"
                    :title="youtubeByUrl[url].status.langs.length
                      ? `Нема UA/EN. Доступні: ${youtubeByUrl[url].status.langs.join(', ')}`
                      : 'Субтитрів немає'">
                    Без UA·EN
                  </q-chip>
                  <q-chip
                    v-else-if="youtubeByUrl[url].langsError"
                    dense
                    square
                    color="orange-2"
                    text-color="orange-9"
                    icon="sym_o_error"
                    :title="youtubeByUrl[url].langsError">
                    ?
                  </q-chip>
                  <q-btn
                    flat
                    dense
                    color="primary"
                    icon="sym_o_subtitles"
                    label="Cубтитри"
                    :disable="youtubeByUrl[url].status?.kind === 'none'"
                    @click="openCaptionDialog(url)" />
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

.url-link {
  color: inherit;
  text-decoration: none;
  display: block;
}

.url-link:hover .text-primary,
.url-link:hover {
  text-decoration: underline;
}

.yt-side {
  flex-direction: row;
  align-items: center;
  gap: 4px;
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
