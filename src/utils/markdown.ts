import MarkdownIt from 'markdown-it'
import { fsContentUrl, isImagePath } from '@/utils/image'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

// 工作区图片路径（智能体生成的图片等）在气泡内经 /api/fs/content 展示；http 外链保持原样
const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = String(token.attrGet('src') ?? '')
  if (src && !/^(https?:|data:)/i.test(src) && isImagePath(src)) {
    token.attrSet('src', fsContentUrl(src))
  }
  return defaultImage ? defaultImage(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
}

export function renderMarkdown(text: string): string {
  return md.render(text)
}
