<script setup lang="ts">
import AppDialog from './AppDialog.vue';
import privacyHtml from '../../public/privacy.html?raw';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

// Only render the trusted policy bundled at build time, never fetched or user-provided HTML.
const policyBody = new DOMParser().parseFromString(privacyHtml, 'text/html').body.innerHTML;
</script>

<template>
  <AppDialog :open="open" title="隐私政策" description="随当前应用版本提供，可离线阅读。外部链接将在浏览器中打开。" wide @update:open="emit('update:open', $event)">
    <div class="privacy-policy" v-html="policyBody" />
  </AppDialog>
</template>

<style scoped>
.privacy-policy { color: var(--ink); font-size: 14px; line-height: 1.85; overflow-wrap: anywhere; }
.privacy-policy :deep(h1) { margin: 0 0 16px; font-size: 23px; font-weight: 700; line-height: 1.5; letter-spacing: -.025em; }
.privacy-policy :deep(h2) { margin: 28px 0 12px; font-size: 18px; font-weight: 650; line-height: 1.5; }
.privacy-policy :deep(p), .privacy-policy :deep(ul) { margin: 12px 0; }
.privacy-policy :deep(ul) { padding-left: 24px; }
.privacy-policy :deep(li + li) { margin-top: 8px; }
.privacy-policy :deep(.policy-date) { color: var(--muted); font-size: 12px; }
.privacy-policy :deep(.policy-summary) { padding: 16px; border-radius: var(--radius-control); background: var(--accent-soft); }
.privacy-policy :deep(a) { color: var(--accent); text-underline-offset: 3px; }
.privacy-policy :deep(a:focus-visible) { outline: 3px solid var(--accent); outline-offset: 3px; }
.privacy-policy :deep(code) { font-size: .95em; }
.privacy-policy :deep(section:last-child > p:last-child) { margin-bottom: 0; }
</style>
