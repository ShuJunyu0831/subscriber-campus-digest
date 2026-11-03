import type { MessageChannel } from './shareImport'

export interface ShareDraft {
  id: string
  title: string
  text: string
  url: string
  receivedAt: number
}

export interface LocalWechatMessage {
  id: string
  groupName: string
  content: string
  sharedAt: number
  /** 采集方式：分享面板 / 批量粘贴 / 剪贴板 / 演示 */
  source: 'wechat-share' | 'dingtalk-share' | 'miniprogram-share' | 'batch-paste' | 'clipboard' | 'demo'
  /** 来源渠道。老数据没有这个字段，一律按微信处理。 */
  channel?: MessageChannel
  /** 已被 AI 分析过的时间戳，避免同一条消息被反复上传 */
  analyzedAt?: number
}

const SHARE_DB = 'subscriber-share-inbox'
const MESSAGE_DB = 'subscriber-local-inbox'
const SHARE_STORE = 'incoming'
const MESSAGE_STORE = 'messages'

function openDatabase(name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持本地数据库'))
      return
    }
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: 'id' })
        if (storeName === MESSAGE_STORE) store.createIndex('sharedAt', 'sharedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
}

export async function readPendingShare(): Promise<ShareDraft | null> {
  const db = await openDatabase(SHARE_DB, SHARE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE, 'readonly')
    const request = transaction.objectStore(SHARE_STORE).get('pending')
    request.onsuccess = () => {
      db.close()
      resolve((request.result?.payload as ShareDraft | undefined) ?? null)
    }
    request.onerror = () => {
      db.close()
      reject(request.error ?? new Error('无法读取分享内容'))
    }
  })
}

export async function clearPendingShare(): Promise<void> {
  const db = await openDatabase(SHARE_DB, SHARE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE, 'readwrite')
    transaction.objectStore(SHARE_STORE).delete('pending')
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法完成分享读取'))
    }
  })
}

export async function listLocalMessages(): Promise<LocalWechatMessage[]> {
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readonly')
    const request = transaction.objectStore(MESSAGE_STORE).getAll()
    request.onsuccess = () => {
      const messages = (request.result as LocalWechatMessage[]).sort((a, b) => b.sharedAt - a.sharedAt)
      db.close()
      resolve(messages)
    }
    request.onerror = () => {
      db.close()
      reject(request.error ?? new Error('无法读取本地消息'))
    }
  })
}

export async function saveLocalMessage(message: LocalWechatMessage): Promise<void> {
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite')
    transaction.objectStore(MESSAGE_STORE).put(message)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法保存本地消息'))
    }
  })
}

/** 批量写入：一次事务保存多条，避免逐条打开数据库（批量导入几十条时差别很明显）。 */
export async function saveLocalMessages(messages: LocalWechatMessage[]): Promise<void> {
  if (messages.length === 0) return
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite')
    const store = transaction.objectStore(MESSAGE_STORE)
    for (const message of messages) store.put(message)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法保存本地消息'))
    }
  })
}

/** 批量标记已分析：只改 analyzedAt，不动原文。 */
export async function markMessagesAnalyzed(ids: string[], analyzedAt = Date.now()): Promise<void> {
  if (ids.length === 0) return
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite')
    const store = transaction.objectStore(MESSAGE_STORE)
    for (const id of ids) {
      const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result as LocalWechatMessage | undefined
        if (record) store.put({ ...record, analyzedAt })
      }
    }
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法更新分析标记'))
    }
  })
}

export async function deleteLocalMessage(id: string): Promise<void> {
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite')
    transaction.objectStore(MESSAGE_STORE).delete(id)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法删除本地消息'))
    }
  })
}

export async function clearLocalMessages(): Promise<void> {
  const db = await openDatabase(MESSAGE_DB, MESSAGE_STORE)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, 'readwrite')
    transaction.objectStore(MESSAGE_STORE).clear()
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('无法清空本地消息'))
    }
  })
}

/**
 * 轻量偏好存储（订阅状态、已读标记、模型选择）。
 * 这类数据只在当前设备有用，用 localStorage 比再开一个 IndexedDB 更省事。
 */
export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式或配额用尽时静默失败，不影响主流程
  }
}
