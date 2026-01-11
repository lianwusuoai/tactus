import type { AIProvider, ChatMessage } from './storage';
import { availableTools, generateToolsPrompt, parseToolCalls, hasToolCall, removeToolCallMarkers, getToolStatusText, type ToolCall, type ToolResult } from './tools';

export interface ModelInfo {
  id: string;
  name?: string;
}

// API 消息类型，支持不同角色
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string; // 工具结果时的工具名称
}

// 存储最后一次发送给模型的完整上下文，用于调试
let lastApiMessages: ApiMessage[] = [];

export function getLastApiMessages(): ApiMessage[] {
  return lastApiMessages;
}

export function setLastApiMessages(messages: ApiMessage[]) {
  lastApiMessages = messages;
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    
    const data = await response.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
    }));
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

// 工具执行器类型
export type ToolExecutor = (toolCall: ToolCall) => Promise<ToolResult>;

// ReAct 配置
export interface ReActConfig {
  enableTools: boolean;
  toolExecutor?: ToolExecutor;
  maxIterations?: number;
}

// 流式聊天事件类型
export type StreamEvent = 
  | { type: 'content'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'thinking'; message: string }
  | { type: 'done' };

export async function* streamChat(
  provider: AIProvider,
  messages: ChatMessage[],
  context?: { sharePageContent?: boolean },
  reactConfig?: ReActConfig
): AsyncGenerator<StreamEvent, void, unknown> {
  const enableTools = reactConfig?.enableTools ?? true; // 默认启用工具
  const toolExecutor = reactConfig?.toolExecutor;
  const maxIterations = reactConfig?.maxIterations || 3;
  
  const basePrompt = `You are a helpful AI assistant. Always respond using Markdown format for better readability. Use:
- Headers (##, ###) for sections
- **bold** and *italic* for emphasis
- \`code\` for inline code and \`\`\` for code blocks with language specification
- Lists (- or 1.) for enumerations
- > for quotes
- Tables when presenting structured data`;

  // 始终添加工具说明，传递上下文信息
  const toolsPrompt = generateToolsPrompt(availableTools, context);
  const systemMessage = `${basePrompt}\n\n${toolsPrompt}`;

  const apiMessages: ApiMessage[] = [
    { role: 'system', content: systemMessage },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.quote ? `[Quote: "${m.quote}"]\n\n${m.content}` : m.content,
    })),
  ];

  // 保存最后一次发送的消息用于调试
  lastApiMessages = [...apiMessages];

  let iteration = 0;
  let currentMessages = [...apiMessages];
  
  while (iteration < maxIterations) {
    iteration++;
    
    // 转换为 API 格式（tool 角色转为 user）
    const messagesForApi = currentMessages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));
    
    const response = fetchChatCompletion(provider, messagesForApi);
    let fullResponse = '';
    let pendingContent = ''; // 待输出的内容缓冲区
    let inToolCall = false; // 是否正在工具调用标记内
    
    // 流式读取响应
    for await (const chunk of response) {
      fullResponse += chunk;
      pendingContent += chunk;
      
      // 检查是否开始了工具调用标记
      if (pendingContent.includes('<tool_call>')) {
        inToolCall = true;
        // 输出 <tool_call> 之前的内容
        const beforeToolCall = pendingContent.split('<tool_call>')[0];
        if (beforeToolCall) {
          yield { type: 'content', content: beforeToolCall };
        }
        pendingContent = '<tool_call>' + pendingContent.split('<tool_call>').slice(1).join('<tool_call>');
      }
      
      // 如果不在工具调用中，正常输出
      if (!inToolCall) {
        // 检查是否可能是工具调用的开始（部分匹配）
        const possibleStart = '<tool_call>'.slice(0, Math.min(pendingContent.length, 11));
        if (pendingContent.endsWith(possibleStart.slice(0, pendingContent.length)) && pendingContent.length < 11) {
          // 可能是工具调用开始，暂不输出
          continue;
        }
        yield { type: 'content', content: chunk };
        pendingContent = '';
      }
    }
    
    // 检查是否有工具调用
    if (enableTools && toolExecutor && hasToolCall(fullResponse)) {
      const toolCalls = parseToolCalls(fullResponse);
      
      for (const toolCall of toolCalls) {
        yield { type: 'tool_call', toolCall };
        yield { type: 'thinking', message: getToolStatusText(toolCall.name) };
        
        // 执行工具
        const result = await toolExecutor(toolCall);
        yield { type: 'tool_result', result };
        
        // 将工具结果添加到消息中，使用 tool 角色
        currentMessages.push({
          role: 'assistant',
          content: fullResponse,
        });
        currentMessages.push({
          role: 'tool',
          content: `<tool_result name="${result.name}">\n${result.result}\n</tool_result>\n\n请基于以上工具返回的内容回答我的问题。`,
          toolName: result.name,
        });
      }
      
      // 继续下一轮迭代
      continue;
    }
    
    // 没有工具调用，结束循环
    lastApiMessages = [...currentMessages, { role: 'assistant', content: fullResponse }];
    break;
  }
  
  yield { type: 'done' };
}

// 内部函数：获取聊天完成
async function* fetchChatCompletion(
  provider: AIProvider,
  messages: { role: string; content: string }[]
): AsyncGenerator<string, void, unknown> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.selectedModel,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {}
      }
    }
  }
}

// 简化版本的流式聊天（向后兼容）
export async function* streamChatSimple(
  provider: AIProvider,
  messages: ChatMessage[],
  pageContent?: string
): AsyncGenerator<string, void, unknown> {
  const basePrompt = `You are a helpful AI assistant. Always respond using Markdown format for better readability. Use:
- Headers (##, ###) for sections
- **bold** and *italic* for emphasis
- \`code\` for inline code and \`\`\` for code blocks with language specification
- Lists (- or 1.) for enumerations
- > for quotes
- Tables when presenting structured data`;

  const systemMessage = pageContent
    ? `${basePrompt}\n\nThe user is viewing a webpage with the following content:\n\n${pageContent}\n\nAnswer questions based on this context when relevant.`
    : basePrompt;

  const apiMessages: ApiMessage[] = [
    { role: 'system', content: systemMessage },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.quote ? `[Quote: "${m.quote}"]\n\n${m.content}` : m.content,
    })),
  ];

  lastApiMessages = apiMessages;

  for await (const chunk of fetchChatCompletion(provider, apiMessages)) {
    yield chunk;
  }
}
