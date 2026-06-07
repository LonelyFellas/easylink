import { QueryCache, QueryClient } from '@tanstack/react-query'

import { addFrontendLog } from '@/services/frontend-log'

// 需要诊断的内核相关查询：失败时（如 IPC socket 未就绪）会让首页卡片
// 卡在「内核通信错误 / 暂无激活节点」。这里把失败与恢复都收进诊断日志
// （内存 + latest.log），方便在 UI 里直接排查。
const WATCHED_QUERY_KEYS = new Set([
  'getProxies',
  'getClashConfig',
  'getProxyProviders',
  'getRuleProviders',
  'getRules',
])

// 自愈轮询每 2s 重试，失败会持续触发；按 key 节流，避免刷爆日志。
const LOG_THROTTLE_MS = 30_000
const lastLoggedAt = new Map<string, number>()
// 记录当前处于失败态的 key，便于在恢复时打一条「recovered」。
const failingKeys = new Set<string>()
const appStart = Date.now()

const uptimeSec = () => Math.round((Date.now() - appStart) / 1000)

const queryCache = new QueryCache({
  onError: (error, query) => {
    const key = String(query.queryKey?.[0] ?? '')
    if (!WATCHED_QUERY_KEYS.has(key)) return

    failingKeys.add(key)

    const now = Date.now()
    if (now - (lastLoggedAt.get(key) ?? 0) < LOG_THROTTLE_MS) return
    lastLoggedAt.set(key, now)

    const msg =
      error instanceof Error ? error.message : String(error ?? 'unknown')
    addFrontendLog(
      'error',
      `[mihomo-query] ${key} failed (uptime=${uptimeSec()}s, failureCount=${
        query.state.fetchFailureCount
      }): ${msg}`,
    )
  },
  onSuccess: (_data, query) => {
    const key = String(query.queryKey?.[0] ?? '')
    if (!failingKeys.has(key)) return
    failingKeys.delete(key)
    lastLoggedAt.delete(key)
    addFrontendLog(
      'info',
      `[mihomo-query] ${key} recovered (uptime=${uptimeSec()}s)`,
    )
  },
})

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 2000,
      retry: 3,
      retryDelay: 5000,
      refetchOnWindowFocus: false,
    },
  },
})
