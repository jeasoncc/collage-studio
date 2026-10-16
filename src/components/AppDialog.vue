<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
withDefaults(defineProps<{ open: boolean; title: string; description?: string; wide?: boolean; locked?: boolean }>(), { description: '', wide: false, locked: false });
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-auto-focus': [event: Event] }>();
</script>

<template>
  <DialogRoot :open="open" @update:open="value => !locked && emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content" :class="{ wide, 'dialog-with-footer': !!$slots.footer }" @open-auto-focus="event => emit('open-auto-focus', event)" @escape-key-down="event => locked && event.preventDefault()" @pointer-down-outside="event => locked && event.preventDefault()">
        <header class="dialog-header">
          <div><DialogTitle class="dialog-title">{{ title }}</DialogTitle><DialogDescription class="dialog-description">{{ description }}</DialogDescription></div>
          <DialogClose v-if="!locked" class="dialog-close text-button">关闭</DialogClose>
        </header>
        <div class="dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.dialog-with-footer > .dialog-body { flex: 1 1 auto; }
.dialog-close { flex: 0 0 auto; min-width: 52px; min-height: 44px; padding: 8px 10px; background: var(--control); color: var(--ink); font-weight: 500; }
.dialog-footer :deep(.dialog-actions) { margin-top: 0; }
.dialog-footer {
  flex: 0 0 auto;
  padding: 16px 24px max(20px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: var(--surface-raised);
  box-shadow: 0 -6px 24px #20332906;
}
@media (max-width: 640px) {
  .dialog-footer { padding: 14px 20px max(16px, env(safe-area-inset-bottom)); }
}
</style>
