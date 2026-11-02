const SHARE_DB = 'subscriber-share-inbox'
const SHARE_STORE = 'incoming'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

function openShareDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.createObjectStore(SHARE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveSharedPayload(payload) {
  const db = await openShareDatabase()
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE, 'readwrite')
    transaction.objectStore(SHARE_STORE).put({ id: 'pending', payload })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return

  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      const clean = value => typeof value === 'string' ? value.slice(0, 100000) : ''
      const payload = {
        id: crypto.randomUUID(),
        title: clean(form.get('title')),
        text: clean(form.get('text')),
        url: clean(form.get('url')),
        receivedAt: Date.now(),
      }
      if (!payload.title && !payload.text && !payload.url) {
        return Response.redirect('/?share=empty', 303)
      }
      await saveSharedPayload(payload)
      return Response.redirect('/?share=received', 303)
    } catch {
      return Response.redirect('/?share=error', 303)
    }
  })())
})
