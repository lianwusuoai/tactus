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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
}

.tc-floating-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}
</style>
