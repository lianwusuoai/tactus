<script setup lang="ts">
const props = defineProps<{
  x: number;
  y: number;
  onAsk: () => void;
}>();
</script>

<template>
  <div
    class="tc-floating-btn"
    :style="{ left: `${props.x + 10}px`, top: `${props.y - 40}px` }"
    @click="props.onAsk"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span>Ask AI</span>
  </div>
</template>

<style scoped>
.tc-floating-btn {
  position: absolute;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #FAFAF8;
  color: #1A1A1A;
  border: 1px solid #1A1A1A;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: "Source Sans 3", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(26, 26, 26, 0.08);
  transition: all 200ms ease-out;
  user-select: none;
}

.tc-floating-btn:hover {
  background: #F5F3F0;
  border-color: #B8860B;
  color: #B8860B;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(26, 26, 26, 0.12);
}

.tc-floating-btn:active {
  transform: translateY(0);
}

.tc-floating-btn svg {
  flex-shrink: 0;
}
</style>
