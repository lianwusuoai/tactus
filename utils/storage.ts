import { storage } from '#imports';

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  selectedModel: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  pageContext?: string;
  quote?: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

// Storage items
export const providersStorage = storage.defineItem<AIProvider[]>('local:providers', {
  fallback: [],
});

export const activeProviderIdStorage = storage.defineItem<string | null>('local:activeProviderId', {
  fallback: null,
});

export const chatSessionStorage = storage.defineItem<ChatSession | null>('local:chatSession', {
  fallback: null,
});

export const sharePageContentStorage = storage.defineItem<boolean>('local:sharePageContent', {
  fallback: false,
});

// Helper functions
export async function getActiveProvider(): Promise<AIProvider | null> {
  const providers = await providersStorage.getValue();
  const activeId = await activeProviderIdStorage.getValue();
  return providers.find(p => p.id === activeId) || null;
}

export async function saveProvider(provider: AIProvider): Promise<void> {
  const providers = await providersStorage.getValue();
  const index = providers.findIndex(p => p.id === provider.id);
  if (index >= 0) {
    providers[index] = provider;
  } else {
    providers.push(provider);
  }
  await providersStorage.setValue(providers);
}

export async function deleteProvider(id: string): Promise<void> {
  const providers = await providersStorage.getValue();
  await providersStorage.setValue(providers.filter(p => p.id !== id));
  const activeId = await activeProviderIdStorage.getValue();
  if (activeId === id) {
    await activeProviderIdStorage.setValue(null);
  }
}
