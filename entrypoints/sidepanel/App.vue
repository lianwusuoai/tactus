<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import {
  providersStorage,
  activeProviderIdStorage,
  sharePageContentStorage,
  getActiveProvider,
  saveProvider,
  deleteProvider,
  type AIProvider,
  type ChatMessage,
} from '../../utils/storage';
import { fetchModels, streamChat } from '../../utils/api';

// State
const messages = ref<ChatMessage[]>([]);
const inputText = ref('');
const sharePageContent = ref(false);
const pendingQuote = ref<string | null>(null);
const isLoading = ref(false);
const showSettings = ref(false);
const chatAreaRef = ref<HTMLElement | null>(null);

// Settings state
const providers = ref<AIProvider[]>([]);
const activeProviderId = ref<string | null>(null);
const editingProvider = ref<AIProvider | null>(null);
const availableModels = ref<string[]>([]);
const isFetchingModels = ref(false);

// Form state
const formName = ref('');
const formBaseUrl = ref('');
const formApiKey = ref('');
const formModel = ref('');
const formCustomModel = ref('');

// Initialize
onMounted(async () => {
  providers.value = await providersStorage.getValue();
  activeProviderId.value = await activeProviderIdStorage.getValue();
  sharePageContent.value = await sharePageContentStorage.getValue();

  // Check for pending quote from content script
  const result = await browser.storage.local.get('pendingQuote');
  if (result.pendingQuote) {
    pendingQuote.value = result.pendingQuote;
    await browser.storage.local.remove('pendingQuote');
  }

  // Listen for storage changes
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes.pendingQuote?.newValue) {
      pendingQuote.value = changes.pendingQuote.newValue;
      browser.storage.local.remove('pendingQuote');
    }
  });
});

// Watch share page content toggle
watch(sharePageContent, async (val) => {
  await sharePageContentStorage.setValue(val);
});

// Scroll to bottom
const scrollToBottom = () => {
  nextTick(() => {
    if (chatAreaRef.value) {
      chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight;
    }
  });
};

// Get page content from active tab
async function getPageContent(): Promise<string | undefined> {
  if (!sharePageContent.value) return undefined;
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return undefined;

    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const article = document.querySelector('article');
        const main = document.querySelector('main');
        const body = document.body;
        const target = article || main || body;
        let text = target.innerText || target.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text.length > 15000 ? text.substring(0, 15000) + '...' : text;
      },
    });

    return results[0]?.result;
  } catch (e) {
    console.error('Failed to get page content:', e);
    return undefined;
  }
}

// Send message
async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  const provider = await getActiveProvider();
  if (!provider) {
    alert('Please configure an AI provider first');
    showSettings.value = true;
    return;
  }

  const userMessage: ChatMessage = {
    role: 'user',
    content: text,
    timestamp: Date.now(),
    quote: pendingQuote.value || undefined,
  };

  messages.value.push(userMessage);
  inputText.value = '';
  pendingQuote.value = null;
  scrollToBottom();

  isLoading.value = true;

  try {
    const pageContent = await getPageContent();
    
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMessage);

    for await (const chunk of streamChat(provider, messages.value.slice(0, -1), pageContent)) {
      assistantMessage.content += chunk;
      scrollToBottom();
    }
  } catch (error: any) {
    messages.value.push({
      role: 'assistant',
      content: `Error: ${error.message}`,
      timestamp: Date.now(),
    });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

// Handle Enter key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// Settings functions
function openSettings() {
  showSettings.value = true;
  resetForm();
}

function closeSettings() {
  showSettings.value = false;
  editingProvider.value = null;
  resetForm();
}

function resetForm() {
  formName.value = '';
  formBaseUrl.value = '';
  formApiKey.value = '';
  formModel.value = '';
  formCustomModel.value = '';
  availableModels.value = [];
}

async function fetchAvailableModels() {
  if (!formBaseUrl.value || !formApiKey.value) return;
  
  isFetchingModels.value = true;
  try {
    const models = await fetchModels(formBaseUrl.value, formApiKey.value);
    availableModels.value = models.map(m => m.id);
  } catch (e) {
    console.error('Failed to fetch models:', e);
  } finally {
    isFetchingModels.value = false;
  }
}

function editProvider(provider: AIProvider) {
  editingProvider.value = provider;
  formName.value = provider.name;
  formBaseUrl.value = provider.baseUrl;
  formApiKey.value = provider.apiKey;
  formModel.value = provider.selectedModel;
  availableModels.value = provider.models;
}

async function saveCurrentProvider() {
  const selectedModel = formModel.value || formCustomModel.value;
  if (!formName.value || !formBaseUrl.value || !formApiKey.value || !selectedModel) {
    alert('Please fill in all required fields');
    return;
  }

  const provider: AIProvider = {
    id: editingProvider.value?.id || crypto.randomUUID(),
    name: formName.value,
    baseUrl: formBaseUrl.value,
    apiKey: formApiKey.value,
    models: availableModels.value,
    selectedModel,
  };

  await saveProvider(provider);
  providers.value = await providersStorage.getValue();
  
  if (!activeProviderId.value) {
    activeProviderId.value = provider.id;
    await activeProviderIdStorage.setValue(provider.id);
  }

  editingProvider.value = null;
  resetForm();
}

async function removeProvider(id: string) {
  if (confirm('Delete this provider?')) {
    await deleteProvider(id);
    providers.value = await providersStorage.getValue();
    if (activeProviderId.value === id) {
      activeProviderId.value = providers.value[0]?.id || null;
      await activeProviderIdStorage.setValue(activeProviderId.value);
    }
  }
}

async function setActiveProvider(id: string) {
  activeProviderId.value = id;
  await activeProviderIdStorage.setValue(id);
}

function clearChat() {
  messages.value = [];
}
</script>

<template>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>TC Chrome Agent</h1>
      <button class="settings-btn" @click="openSettings">⚙️ Settings</button>
    </div>

    <!-- Options bar -->
    <div class="options-bar">
      <label class="checkbox-label">
        <input type="checkbox" v-model="sharePageContent" />
        Share current page content
      </label>
      <button v-if="messages.length" class="btn btn-sm btn-secondary" @click="clearChat">
        Clear
      </button>
    </div>

    <!-- Chat area -->
    <div class="chat-area" ref="chatAreaRef">
      <div v-if="!messages.length" class="empty-state">
        <p>👋 Hi! Ask me anything.</p>
        <p v-if="sharePageContent" style="font-size: 12px; margin-top: 8px;">
          Page content will be shared with AI
        </p>
      </div>

      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="message"
        :class="msg.role"
      >
        <div v-if="msg.quote" class="quote">"{{ msg.quote }}"</div>
        <div v-html="msg.content.replace(/\n/g, '<br>')"></div>
      </div>

      <div v-if="isLoading" class="loading">
        <div class="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        Thinking...
      </div>
    </div>

    <!-- Input area -->
    <div class="input-area">
      <div v-if="pendingQuote" class="pending-quote">
        <div class="quote-text">"{{ pendingQuote }}"</div>
        <button class="remove-quote" @click="pendingQuote = null">×</button>
      </div>
      <div class="input-wrapper">
        <textarea
          v-model="inputText"
          placeholder="Type your message..."
          rows="1"
          @keydown="handleKeydown"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="isLoading || !inputText.trim()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="modal-overlay" @click.self="closeSettings">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingProvider ? 'Edit Provider' : 'Settings' }}</h2>
          <button class="close-btn" @click="closeSettings">×</button>
        </div>
        <div class="modal-body">
          <!-- Provider list -->
          <div v-if="!editingProvider" class="provider-list">
            <div
              v-for="p in providers"
              :key="p.id"
              class="provider-item"
              :class="{ active: p.id === activeProviderId }"
            >
              <div class="provider-info" @click="setActiveProvider(p.id)">
                <div class="provider-name">{{ p.name }}</div>
                <div class="provider-model">{{ p.selectedModel }}</div>
              </div>
              <div class="provider-actions">
                <button class="btn btn-sm btn-secondary" @click="editProvider(p)">Edit</button>
                <button class="btn btn-sm btn-danger" @click="removeProvider(p.id)">×</button>
              </div>
            </div>
            <button class="btn btn-primary" style="width: 100%" @click="editingProvider = {} as any">
              + Add Provider
            </button>
          </div>

          <!-- Provider form -->
          <div v-else>
            <div class="form-group">
              <label>Provider Name</label>
              <input v-model="formName" placeholder="e.g., OpenAI, Claude, Local LLM" />
            </div>
            <div class="form-group">
              <label>Base URL</label>
              <input v-model="formBaseUrl" placeholder="https://api.openai.com" />
            </div>
            <div class="form-group">
              <label>API Key</label>
              <input v-model="formApiKey" type="password" placeholder="sk-..." />
            </div>
            <div class="form-group">
              <button
                class="btn btn-secondary btn-sm"
                @click="fetchAvailableModels"
                :disabled="isFetchingModels"
              >
                {{ isFetchingModels ? 'Fetching...' : 'Fetch Models' }}
              </button>
            </div>
            <div class="form-group">
              <label>Model</label>
              <select v-model="formModel" v-if="availableModels.length">
                <option value="">Select a model</option>
                <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
              </select>
              <input
                v-else
                v-model="formCustomModel"
                placeholder="Enter model name (e.g., gpt-4)"
              />
            </div>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
              <button class="btn btn-secondary" @click="editingProvider = null; resetForm()">
                Cancel
              </button>
              <button class="btn btn-primary" style="flex: 1" @click="saveCurrentProvider">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
