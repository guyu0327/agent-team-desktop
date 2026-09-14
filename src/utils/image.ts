const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0 || dot === path.length - 1) return false
  return IMAGE_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase())
}

/** 气泡/缩略图展示服务端图片的地址 */
export function fsContentUrl(path: string): string {
  return `/api/fs/content?path=${encodeURIComponent(path)}`
}
