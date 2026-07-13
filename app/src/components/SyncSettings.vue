<template>
  <q-dialog @update:model-value="$emit('update:modelValue', $event)" :model-value="modelValue">
    <q-card style="min-width: 360px; max-width: 480px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1">Синхронізація</div>
        <q-space />
        <q-btn v-close-popup icon="sym_o_close" flat round dense />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input v-model="relayUrl" label="Relay URL" dense outlined placeholder="https://relay.example.com" />
        <q-input v-model="oryIssuer" label="Ory issuer" dense outlined placeholder="https://id.nitra.dev/oauth2" />
        <q-input v-model="clientId" label="Client ID" dense outlined placeholder="myshare" />
      </q-card-section>

      <q-card-section class="row items-center q-gutter-sm">
        <q-chip :color="statusColor" text-color="white" dense>{{ statusLabel }}</q-chip>
        <q-space />
        <q-btn
          v-if="!loggedIn"
          @click="login"
          color="primary"
          no-caps
          label="Увійти через Ory"
          :disable="!relayUrl || !oryIssuer || !clientId"
          :loading="loggingIn" />
        <q-btn v-else @click="logout" flat color="negative" no-caps label="Вийти" />
      </q-card-section>

      <q-card-section v-if="errorMessage" class="text-negative text-caption">
        {{ errorMessage }}
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { isAndroidPlatform } from '../platform.js'
import { listenForOAuthCallback, startLogin } from '../sync/auth.js'
import { pullOnce, startSync, stopSync } from '../sync/client.js'
import { clearSession, loadSession } from '../sync/session-store.js'

defineProps({ modelValue: Boolean })
defineEmits(['update:modelValue'])

const relayUrl = ref('')
const oryIssuer = ref('')
const clientId = ref('myshare')
const loggedIn = ref(false)
const loggingIn = ref(false)
const errorMessage = ref('')

const statusLabel = computed(() => {
  if (!relayUrl.value || !oryIssuer.value) return 'не налаштовано'
  return loggedIn.value ? 'увійшли' : 'не увійшли'
})
const statusColor = computed(() => (loggedIn.value ? 'positive' : 'grey-6'))

/**
 * Re-read the persisted sync session and reflect it in the form/status.
 * @returns {Promise<void>}
 */
async function refreshFromSession() {
  const session = await loadSession()
  loggedIn.value = Boolean(session?.accessToken)
  if (session) {
    relayUrl.value = session.relayUrl ?? relayUrl.value
    oryIssuer.value = session.oryIssuer ?? oryIssuer.value
    clientId.value = session.clientId ?? clientId.value
  }
}

/**
 * Kick off the Ory PKCE login flow (opens the system browser).
 * @returns {Promise<void>}
 */
async function login() {
  errorMessage.value = ''
  loggingIn.value = true
  try {
    await startLogin({ relayUrl: relayUrl.value, oryIssuer: oryIssuer.value, clientId: clientId.value })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loggingIn.value = false
  }
}

/**
 * Clear the local session and stop the sync loop.
 * @returns {Promise<void>}
 */
async function logout() {
  stopSync()
  await clearSession()
  loggedIn.value = false
}

/**
 * Once a login completes (deep-link callback), resume the app's sync loop —
 * desktop keeps a persistent WS, Android does a one-shot HTTP catch-up.
 * @returns {Promise<void>}
 */
async function onLoggedIn() {
  await refreshFromSession()
  if (isAndroidPlatform()) await pullOnce()
  else await startSync()
}

onMounted(async () => {
  await refreshFromSession()
  await listenForOAuthCallback(onLoggedIn, error => {
    loggingIn.value = false
    errorMessage.value = error.message
  })
})
</script>
