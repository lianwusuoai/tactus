import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ExtractedContent {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  url: string;
}

export interface ExtractOptions {
  useRawExtract?: boolean;
}

/**
 * 原始提取：直接获取 body 文本，保留所有内容（包括评论等）
 */
function extractRawContent(doc: Document, url: string): ExtractedContent {
  const body = doc.body;
  
  // 克隆 body 以避免修改原始 DOM
  const clone = body.cloneNode(true) as HTMLElement;
  
  // 移除脚本、样式等无用元素
  clone.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove());
  
  const text = clone.innerText || clone.textContent || '';
  
  return {
    title: doc.title || '',
    content: text,
    textContent: text,
    excerpt: text.substring(0, 200),
    byline: null,
    siteName: null,
    url,
  };
}

/**
 * 使用 Readability 提取页面主要内容，并用 Turndown 转换为 Markdown
 */
export function extractPageContent(doc: Document, url: string, options?: ExtractOptions): ExtractedContent {
  // 如果指定使用原始提取，直接返回
  if (options?.useRawExtract) {
    return extractRawContent(doc, url);
  }
  
  // 克隆文档以避免修改原始 DOM
  const clonedDoc = doc.cloneNode(true) as Document;
  
  // 使用 Readability 解析
  const reader = new Readability(clonedDoc);
  const article = reader.parse();
  
  if (!article) {
    // 降级处理：直接获取 body 文本
    const body = doc.body;
    const text = body.innerText || body.textContent || '';
    return {
      title: doc.title || '',
      content: text,
      textContent: text,
      excerpt: text.substring(0, 200),
      byline: null,
      siteName: null,
      url,
    };
  }
  
  // 使用 Turndown 将 HTML 转换为 Markdown
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  
  // 添加规则：移除脚本和样式
  turndown.remove(['script', 'style', 'noscript']);
  
  const markdown = turndown.turndown(article.content || '');
  
  return {
    title: article.title || '',
    content: markdown,
    textContent: article.textContent || '',
    excerpt: article.excerpt || (article.textContent || '').substring(0, 200),
    byline: article.byline || null,
    siteName: article.siteName || null,
    url,
  };
}

/**
 * 限制内容长度
 */
export function truncateContent(content: string, maxLength: number = 30000): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '\n\n[内容已截断...]';
}
