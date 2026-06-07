import dayjs from 'dayjs'
import { useSyncExternalStore } from 'react'

import { logFrontend } from '@/services/cmds'

/**
 * 前端诊断日志 store。
 *
 * 用于把「纯前端侧」的异常（如内核 IPC 不可达导致的「内核通信错误 /
 * 暂无激活节点」）实时收进内存环形缓冲，既落盘 latest.log，也能在 UI 里
 * 直接查看，方便排查偶发问题。
 */

export type FrontendLogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface FrontendLogEntry {
  id: number
  /** HH:mm:ss.SSS */
  time: string
  level: FrontendLogLevel
  message: string
}

const MAX_ENTRIES = 500

let logs: FrontendLogEntry[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/**
 * 追加一条前端诊断日志。
 * @param toBackend 是否同时写入后端 latest.log（默认写）。
 */
export function addFrontendLog(
  level: FrontendLogLevel,
  message: string,
  { toBackend = true }: { toBackend?: boolean } = {},
) {
  const entry: FrontendLogEntry = {
    id: ++seq,
    time: dayjs().format('HH:mm:ss.SSS'),
    level,
    message,
  }
  logs = [...logs, entry].slice(-MAX_ENTRIES)
  emit()
  if (toBackend) logFrontend(level, message)
}

export function clearFrontendLogs() {
  logs = []
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot() {
  return logs
}

/** React 订阅：实时拿到诊断日志列表。 */
export function useFrontendLogs() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
