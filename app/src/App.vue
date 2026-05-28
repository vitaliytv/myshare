<script setup>
import { extractSharedUrl } from './shared-url.js'

const sharedText = ref('')
const sharedUrl = computed(() => extractSharedUrl(sharedText.value))

function applySharedText(value) {
  sharedText.value = typeof value === 'string' ? value : ''
}

function handleAndroidShare(event) {
  applySharedText(event.detail?.text)
}

onMounted(() => {
  applySharedText(window.localStorage.getItem('myshare.sharedText'))
  window.addEventListener('myshare:android-share', handleAndroidShare)
})

onUnmounted(() => {
  window.removeEventListener('myshare:android-share', handleAndroidShare)
})
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="column items-center justify-center q-pa-lg text-center">
        <q-card class="share-card" flat bordered>
          <q-card-section>
            <div class="text-h4 q-mb-sm">myshare</div>
            <div class="text-body1 text-grey-7">Приймає посилання через Android Share</div>
          </q-card-section>

          <q-separator />

          <q-card-section v-if="sharedUrl">
            <div class="text-overline text-grey-7">Отримане посилання</div>
            <a class="shared-url text-primary" :href="sharedUrl" target="_blank" rel="noreferrer">
              {{ sharedUrl }}
            </a>
          </q-card-section>

          <q-card-section v-else>
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
  display: block;
  overflow-wrap: anywhere;
  text-decoration: none;
}
</style>
