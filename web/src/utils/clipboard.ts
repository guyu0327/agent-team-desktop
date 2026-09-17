/** 复制文本到剪贴板（需在用户手势内调用） */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/**
 * 复制网络图片到剪贴板。Chromium 的 write() 稳定支持的位图格式是 image/png，
 * 其他格式（jpeg/webp 等）先经 canvas 转码为 PNG 再写入。
 */
export async function copyImage(src: string): Promise<void> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`图片下载失败 (${res.status})`)
  let blob = await res.blob()
  if (blob.type !== 'image/png') {
    blob = await toPngBlob(blob)
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

function toPngBlob(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片转码失败'))), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}
