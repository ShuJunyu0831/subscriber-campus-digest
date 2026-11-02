export {}

declare global {
  interface Window {
    subscriberDesktop?: {
      platform: string
      version: string
      isDesktop: boolean
    }
  }
}
