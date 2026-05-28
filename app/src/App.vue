<script setup>
import { extractSharedUrl } from './shared-url.js'
import { appendUrlToHistory, loadUrlHistory, saveUrlHistory } from './url-history.js'

const urlHistory = ref([])

function handleAndroidShare(event) {
  const text = typeof event.detail?.text === 'string' ? event.detail.text : ''
  const url = extractSharedUrl(text)
  if (!url) return

  urlHistory.value = appendUrlToHistory(urlHistory.value, url)
  saveUrlHistory(window.localStorage, urlHistory.value)
}

onMounted(() => {
  urlHistory.value = loadUrlHistory(window.localStorage)
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
                tag="a"
              >
                <q-item-section>
                  <q-item-label class="shared-url text-primary">{{ url }}</q-item-label>
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
