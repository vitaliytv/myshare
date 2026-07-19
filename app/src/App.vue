<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>
          MyShare
          <span v-if="appVersion" class="text-caption text-blue-2">v{{ appVersion }}</span>
        </q-toolbar-title>
        <q-select
          v-if="canTranslate"
          v-model="selectedModel"
          @update:model-value="onModelChange"
          :options="omlxModels"
          dense
          outlined
          dark
          hide-bottom-space
          :disable="!omlxModels.length"
          style="min-width: 170px; font-size: 0.8rem" />
        <q-btn @click="agentOpen = true" flat dense no-caps icon="sym_o_smart_toy" label="Агент" />
        <q-btn @click="auditOpen = true" flat dense round icon="sym_o_history" title="Журнал запитів" />
        <q-btn @click="syncOpen = true" flat dense round icon="sym_o_sync" title="Синхронізація" />
      </q-toolbar>
    </q-header>

    <AgentDialog
      v-model="agentOpen"
      :agent="agent"
      prompt-hint="наприклад: отримай субтитри відео youtube.com/watch?v=… і перекладиукраїнською" />
    <AuditDialog v-model="auditOpen" :agent="agent" />
    <SyncSettings v-model="syncOpen" />
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
              @keyup.enter="submitShareHelper"
              dense
              outlined
              placeholder="Вставити URL для симуляції share">
              <template #append>
                <q-btn
                  @click="submitShareHelper"
                  flat
                  dense
                  color="primary"
                  icon="sym_o_send"
                  :disable="!helperInput.trim()" />
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
                  <q-spinner v-if="metaByUrl[url]?.loading" color="primary" size="32px" />
                  <q-avatar v-else size="32px" rounded>
                    <q-img
                      v-if="metaByUrl[url]?.favicon"
                      @error="metaByUrl[url].favicon = ''"
                      :src="metaByUrl[url].favicon"
                      :ratio="1"
                      no-spinner>
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
                  <q-spinner v-if="youtubeByUrl[url].langsLoading" color="primary" size="20px" />
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
                    :title="
                      youtubeByUrl[url].status.langs.length
                        ? `Нема UA/EN. Доступні: ${youtubeByUrl[url].status.langs.join(', ')}`
                        : 'Субтитрів немає'
                    ">
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
                    @click="openCaptionDialog(url)"
                    flat
                    dense
                    color="primary"
                    icon="sym_o_subtitles"
                    label="Cубтитри"
                    :disable="youtubeByUrl[url].status?.kind === 'none'" />
                  <!-- Переклад EN→UA через локальний omlx (тільки desktop,
                       тільки коли українських нема, а англійські є). -->
                  <q-btn
                    v-if="canTranslate && youtubeByUrl[url].status?.kind === 'en'"
                    @click="openTranslateDialog(url)"
                    flat
                    dense
                    color="deep-purple"
                    icon="sym_o_translate"
                    :label="translations[youtubeByUrl[url].videoId] ? 'Переклад' : 'Перекласти'"
                    :title="
                      translations[youtubeByUrl[url].videoId]
                        ? 'Показати збережений переклад українською'
                        : 'Перекласти англійські субтитри українською (omlx)'
                    " />
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    @click="handleRemoveLink(url)"
                    flat
                    dense
                    round
                    icon="sym_o_delete"
                    title="Видалити посилання" />
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
              <q-btn v-close-popup icon="sym_o_close" flat round dense />
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

        <!-- Модалка перекладу: оригінал (EN) поруч із перекладом (UA) -->
        <q-dialog v-model="translateDialog.open" maximized>
          <q-card class="column translate-dialog">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-subtitle1 ellipsis">{{ translateDialog.title }}</div>
              <q-space />
              <q-btn v-close-popup icon="sym_o_close" flat round dense />
            </q-card-section>

            <q-card-section class="col scroll">
              <div v-if="translateDialog.loading" class="column items-center q-py-xl">
                <q-spinner color="deep-purple" size="40px" />
                <div class="q-mt-md text-grey-7">
                  Переклад через omlx…
                  <span v-if="translateDialog.progress?.total">
                    {{ translateDialog.progress.done }}/{{ translateDialog.progress.total }} фрагментів
                  </span>
                </div>
              </div>
              <div v-else-if="translateDialog.error" class="text-negative">
                Не вдалося перекласти: {{ translateDialog.error }}
                <div class="text-grey-7 q-mt-sm">
                  Переконайся, що omlx запущено на <code>http://127.0.0.1:8000</code>
                </div>
              </div>
              <div v-else class="cmp-grid">
                <div class="cmp-head">Оригінал (EN)</div>
                <div class="cmp-head">Переклад (UA)</div>
                <template v-for="(seg, i) in translateDialog.segments" :key="i">
                  <pre class="cmp-cell">{{ seg.original }}</pre>
                  <pre class="cmp-cell">{{ seg.translated }}</pre>
                </template>
              </div>
            </q-card-section>
          </q-card>
        </q-dialog>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { getVersion } from '@tauri-apps/api/app'
import { AgentDialog, AuditDialog } from '@7n/tauri-components/components'
import { useUpdater } from '@7n/tauri-components/vue'
import { consumePendingSharedText, extractSharedUrl } from './shared-url.js'
import { addLink, listLinkRecords, listLinks, removeLink } from './link-store.js'
import { useAcpAgent } from './composables/use-acp-agent.js'
import { isAndroidPlatform } from './platform.js'
import { extractYoutubeVideoId } from './youtube.js'
import { captionStatus, loadLangsCache, saveLangsCache } from './caption-langs.js'
import { listOmlxModels, DEFAULT_MODEL } from './omlx.js'
import { loadTranslations, saveTranslations } from './translation-cache.js'
import { loadModelPref, saveModelPref } from './model-pref.js'
import SyncSettings from './components/SyncSettings.vue'
import {
  pullOnce,
  pushLinkMutation,
  pushTranslationMutation,
  startSync,
  stopSync,
  SYNC_UPDATED_EVENT
} from './sync/client.js'
import { loadSession } from './sync/session-store.js'
// Бекенд-дії йдуть через єдиний tool-surface (n-tool-surface): той самий
// `dispatch`, що його використовує LLM-агент. UI лише розпаковує конверт
// {ok, output|error}. extractYoutubeVideoId лишається прямим — це чистий
// клієнтський парсинг URL (tool youtube_id існує для агента), а listOmlxModels —
// інфра вибору моделі, не доменна дія.
import { dispatch } from './tool/index.js'

// На Android користувач отримує URL через справжній Share intent (MainActivity →
// CustomEvent). На desktop dev share intent'у нема — показуємо input як helper,
// що віддає той самий event і прогоняє його handleAndroidShare.
const showShareHelper = !isAndroidPlatform()
// Переклад субтитрів через локальний omlx (OpenAI-compatible MLX) доступний
// лише на desktop (Mac) — на Android omlx-сервера нема.
const canTranslate = !isAndroidPlatform()
const helperInput = ref('')

const appVersion = ref('')
const urlHistory = ref([])
const agent = useAcpAgent()
useUpdater()
const agentOpen = ref(false)
const auditOpen = ref(false)
const syncOpen = ref(false)
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

// Кеш videoId → запис перекладу ({model, originalLang, segments}). Живе у
// localStorage — переклад одного відео робимо лише раз.
const translations = ref({})

// Список завантажених omlx-моделей і вибрана модель (зберігається у
// localStorage через saveModelPref).
const omlxModels = ref([])
const selectedModel = ref(DEFAULT_MODEL)

/**
 *
 */
function onModelChange(model) {
  saveModelPref(model, localStorage)
}

// Фетчить metadata для url якщо ще не починали; кешує у metaByUrl.
/**
 *
 */
async function ensureMeta(url) {
  if (metaByUrl.value[url]) return
  metaByUrl.value[url] = { title: '', favicon: '', loading: true, error: '' }
  const res = await dispatch('page_meta', { url })
  if (res.ok) {
    metaByUrl.value[url] = { ...res.output, loading: false, error: '' }
  } else {
    metaByUrl.value[url] = { title: '', favicon: '', loading: false, error: res.error.message }
  }
}

// Помічає YouTube URL у `youtubeByUrl`, щоб UI показав кнопку, і підтягує
// статус наявності субтитрів (uk → en). Сам транскрипт не фетчимо до тапу.
/**
 *
 */
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
/**
 *
 */
async function ensureCaptionLangs(url, videoId) {
  const cached = langsCache.value[videoId]
  if (cached) {
    youtubeByUrl.value[url] = { ...youtubeByUrl.value[url], status: captionStatus(cached) }
    return
  }
  youtubeByUrl.value[url] = { ...youtubeByUrl.value[url], langsLoading: true, langsError: '' }
  const res = await dispatch('languages', { videoId })
  if (res.ok) {
    const langs = res.output
    langsCache.value = { ...langsCache.value, [videoId]: langs }
    saveLangsCache(localStorage, langsCache.value)
    youtubeByUrl.value[url] = {
      ...youtubeByUrl.value[url],
      langsLoading: false,
      status: captionStatus(langs)
    }
  } else {
    youtubeByUrl.value[url] = {
      ...youtubeByUrl.value[url],
      langsLoading: false,
      langsError: res.error.message
    }
  }
}

/**
 *
 */
async function handleAndroidShare(event) {
  const text = typeof event.detail?.text === 'string' ? event.detail.text : ''
  const url = extractSharedUrl(text)
  if (!url) return

  urlHistory.value = await addLink(url)
  ensureMeta(url)
  ensureYoutube(url)

  const records = await listLinkRecords()
  const record = records.find(r => r.url === url)
  if (record) pushLinkMutation(record)
}

/**
 * Tombstone a link and push the deletion to the relay so other devices merge it.
 * @param {string} url the link to remove
 */
async function handleRemoveLink(url) {
  const before = await listLinkRecords()
  const record = before.find(r => r.url === url)
  urlHistory.value = await removeLink(url)
  if (record) pushLinkMutation({ id: record.id, url: null, deleted: true, createdAt: record.createdAt })
}

/**
 * Refresh from local storage after the sync client folds in remote mutations.
 */
async function handleSyncUpdated() {
  urlHistory.value = await listLinks()
  for (const url of urlHistory.value) {
    ensureMeta(url)
    ensureYoutube(url)
  }
  translations.value = loadTranslations(localStorage)
}

/**
 *
 */
function submitShareHelper() {
  const text = helperInput.value.trim()
  if (!text) return
  handleAndroidShare({ detail: { text } })
  helperInput.value = ''
}

/**
 *
 */
function consumePendingAndroidShare() {
  const text = consumePendingSharedText(localStorage)
  if (text) handleAndroidShare({ detail: { text } })
}

// --- Subtitle dialog ---------------------------------------------------------
const captionDialog = ref({
  open: false,
  title: '', // заголовок діалогу (title сторінки + мова)
  text: '',
  loading: false,
  error: ''
})

/**
 *
 */
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
  const res = await dispatch('transcript', { videoId: yt.videoId, preferred: PREFERRED_CAPTION_LANGS })
  if (res.ok) {
    captionDialog.value = {
      ...captionDialog.value,
      title: `${baseTitle} — субтитри ${res.output.languageCode}`,
      text: res.output.text,
      loading: false
    }
  } else {
    captionDialog.value = { ...captionDialog.value, loading: false, error: res.error.message }
  }
}

// --- Translation dialog ------------------------------------------------------
const translateDialog = ref({
  open: false,
  title: '',
  loading: false,
  progress: null, // { done, total } під час перекладу
  segments: [], // [{ original, translated }] для порівняння
  error: ''
})

// Відкриває переклад субтитрів українською. Якщо вже перекладали це відео —
// показуємо з кешу миттєво. Інакше тягнемо англійський транскрипт, женемо через
// omlx по чанках (з прогресом) і кешуємо результат.
/**
 *
 */
async function openTranslateDialog(url) {
  const yt = youtubeByUrl.value[url]
  if (!yt?.videoId) return
  const videoId = yt.videoId
  const baseTitle = metaByUrl.value[url]?.title || url
  const title = `${baseTitle} — переклад 🇺🇦`

  const cached = translations.value[videoId]
  if (cached) {
    translateDialog.value = { open: true, title, loading: false, progress: null, segments: cached.segments, error: '' }
    return
  }

  translateDialog.value = { open: true, title, loading: true, progress: { done: 0, total: 0 }, segments: [], error: '' }

  // Оригінал — англійський транскрипт (uk тут за визначенням немає).
  const tr = await dispatch('transcript', { videoId, preferred: ['en'] })
  if (!tr.ok) {
    translateDialog.value = { ...translateDialog.value, loading: false, progress: null, error: tr.error.message }
    return
  }
  // Прогрес по чанках — UI-афорданс поза JSON-схемою; передаємо через ctx.
  const res = await dispatch(
    'translate',
    { text: tr.output.text, model: selectedModel.value },
    {
      onProgress: (done, total) => {
        translateDialog.value = { ...translateDialog.value, progress: { done, total } }
      }
    }
  )
  if (res.ok) {
    const entry = { model: res.output.model, originalLang: 'en', segments: res.output.segments }
    translations.value = { ...translations.value, [videoId]: entry }
    saveTranslations(localStorage, translations.value)
    pushTranslationMutation({ videoId, entry, deleted: false })
    translateDialog.value = { ...translateDialog.value, loading: false, progress: null, segments: res.output.segments }
  } else {
    translateDialog.value = { ...translateDialog.value, loading: false, progress: null, error: res.error.message }
  }
}

// --- Lifecycle ---------------------------------------------------------------
onMounted(async () => {
  appVersion.value = await getVersion()
  langsCache.value = loadLangsCache(localStorage)
  translations.value = loadTranslations(localStorage)
  urlHistory.value = await listLinks()
  for (const url of urlHistory.value) {
    ensureMeta(url)
    ensureYoutube(url)
  }
  globalThis.addEventListener('myshare:android-share', handleAndroidShare)
  globalThis.addEventListener(SYNC_UPDATED_EVENT, handleSyncUpdated)
  consumePendingAndroidShare()

  const session = await loadSession()
  if (session?.accessToken) {
    if (isAndroidPlatform()) await pullOnce()
    else await startSync()
  }

  if (canTranslate) {
    const saved = loadModelPref(localStorage)
    try {
      const list = await listOmlxModels()
      omlxModels.value = list
      if (saved && list.includes(saved)) selectedModel.value = saved
      else if (list.includes(DEFAULT_MODEL)) selectedModel.value = DEFAULT_MODEL
      else if (list.length) selectedModel.value = list[0]
    } catch {
      omlxModels.value = []
      if (saved) selectedModel.value = saved
    }
  }
})

onUnmounted(() => {
  globalThis.removeEventListener('myshare:android-share', handleAndroidShare)
  globalThis.removeEventListener(SYNC_UPDATED_EVENT, handleSyncUpdated)
  stopSync()
})
</script>

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
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.45;
  max-height: 70vh;
  overflow-y: auto;
  margin: 0;
}

.translate-dialog {
  width: 100%;
  height: 100%;
}

.cmp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
  align-items: start;
}

.cmp-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 0;
  font-weight: 600;
  background: var(--q-page, #fff);
  border-bottom: 2px solid rgb(0 0 0 / 12%);
}

.cmp-cell {
  margin: 0;
  padding: 10px 0;
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-bottom: 1px solid rgb(0 0 0 / 6%);
}

@media (width <= 600px) {
  .cmp-grid {
    grid-template-columns: 1fr;
    row-gap: 4px;
  }

  .cmp-head:nth-child(2) {
    display: none;
  }
}
</style>
