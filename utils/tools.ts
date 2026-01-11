/**
 * ReAct 工具定义
 */

export interface Tool {
  name: string;
  description: string;
  statusText: string; // 工具执行时的状态提示
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: string;
  success: boolean;
}

// 定义可用工具
export const availableTools: Tool[] = [
  {
    name: 'extract_page_content',
    description: '提取并清洗当前网页的主要内容，返回包含标题、作者、来源等元数据的结构化 Markdown 格式文本。当用户询问关于当前页面的问题时，必须先调用此工具获取页面内容。',
    statusText: '正在提取网页内容...',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// 获取工具的状态提示文本
export function getToolStatusText(toolName: string): string {
  const tool = availableTools.find(t => t.name === toolName);
  return tool?.statusText || `正在执行 ${toolName}...`;
}

// 生成工具描述文本
export function generateToolsPrompt(tools: Tool[], context?: { sharePageContent?: boolean }): string {
  const toolDescriptions = tools.map(tool => {
    const params = Object.entries(tool.parameters.properties)
      .map(([name, prop]) => `  - ${name} (${prop.type}): ${prop.description}`)
      .join('\n');
    
    return `### ${tool.name}
${tool.description}${params ? `\n参数:\n${params}` : ''}`;
  }).join('\n\n');

  // 构建上下文提示
  const contextHints: string[] = [];
  if (context?.sharePageContent) {
    contextHints.push('- 用户已勾选"分享当前页面内容"，当用户询问关于当前页面的问题时，你必须先调用 extract_page_content 工具获取页面内容');
  } else {
    contextHints.push('- 用户未勾选"分享当前页面内容"，extract_page_content 工具当前不可用');
  }

  return `你可以使用以下工具来获取信息：

${toolDescriptions}

## 使用方法
当你需要使用工具时，请按以下格式输出：

<tool_call>
{"name": "工具名称", "arguments": {}}
</tool_call>

等待工具返回结果后，再基于结果回答用户问题。

## 当前上下文
${contextHints.join('\n')}

## 重要提示
- 不要假设页面内容，必须通过工具获取真实内容
- 工具调用后会返回结果，你需要基于结果进行回答`;
}

// 解析 LLM 输出中的工具调用
export function parseToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && typeof parsed.name === 'string') {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || {},
        });
      }
    } catch (e) {
      console.error('Failed to parse tool call:', e);
    }
  }
  
  return toolCalls;
}

// 检查内容是否包含工具调用
export function hasToolCall(content: string): boolean {
  return /<tool_call>[\s\S]*?<\/tool_call>/.test(content);
}

// 移除内容中的工具调用标记
export function removeToolCallMarkers(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}
