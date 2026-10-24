// Jembatan tipis agar non-component (query cache) bisa memunculkan toast antd.

interface Messenger {
  error: (content: string) => void
  success: (content: string) => void
  info: (content: string) => void
}

let messenger: Messenger = {
  error: (content) => console.error(content),
  success: (content) => console.info(content),
  info: (content) => console.info(content),
}

export function setMessenger(next: Messenger): void {
  messenger = next
}

export const notify = {
  error: (content: string) => messenger.error(content),
  success: (content: string) => messenger.success(content),
  info: (content: string) => messenger.info(content),
}
