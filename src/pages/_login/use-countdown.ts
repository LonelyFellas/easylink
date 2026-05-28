import { useEffect, useState } from 'react'

/** 通用倒计时：调用 start(n) 启动，0 表示已结束 */
export function useCountdown() {
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  return { countdown, start: setCountdown }
}
