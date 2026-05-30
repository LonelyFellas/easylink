import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useAppRefreshers } from '@/providers/app-data-context'
import { useAuth } from '@/providers/auth-context'
import { ensureNodeProfile } from '@/services/auto-subscribe'
import { showNotice } from '@/services/notice-service'

import { CODE_COUNTDOWN_SEC, EMAIL_RE, PHONE_RE } from './constants'
import type { LoginMethod, LoginTab } from './types'
import { useCountdown } from './use-countdown'

/** 登录表单：状态 + 校验 + 提交，UI 层只消费返回值 */
export function useLoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, loginByCode, getSmsCode } = useAuth()
  const { refreshAll } = useAppRefreshers()

  // tab / 方式
  const [tab, setTab] = useState<LoginTab>('phone')
  const [method, setMethod] = useState<LoginMethod>('password')

  // 字段
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')

  // sms 流（与注册的状态相互隔离）
  const [sentCode, setSentCode] = useState('')
  const [sentTarget, setSentTarget] = useState('')
  const { countdown, start: startCountdown } = useCountdown()

  // 内联错误
  const [targetError, setTargetError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const target = tab === 'phone' ? phone.trim() : email.trim()

  const validateTarget = () => {
    if (tab === 'phone') {
      const v = phone.trim()
      if (!v) {
        setTargetError(t('auth.errors.phoneEmpty'))
        return false
      }
      if (!PHONE_RE.test(v)) {
        setTargetError(t('auth.errors.phoneInvalid'))
        return false
      }
    } else {
      const v = email.trim()
      if (!v) {
        setTargetError(t('auth.errors.emailEmpty'))
        return false
      }
      if (!EMAIL_RE.test(v)) {
        setTargetError(t('auth.errors.emailInvalid'))
        return false
      }
    }
    setTargetError('')
    return true
  }

  const handleGetCode = async () => {
    if (countdown > 0) return
    if (!validateTarget()) return
    try {
      await getSmsCode(target)
      // TODO: 接入真实验证码
      setSentCode('000000')
      setSentTarget(target)
      startCountdown(CODE_COUNTDOWN_SEC)
    } catch (err: any) {
      showNotice.error(err?.toString?.() ?? String(err))
    }
  }

  const switchTab = (next: LoginTab) => {
    setTab(next)
    // 邮箱仅支持密码登录；手机沿用上一次方式
    setMethod(next === 'phone' ? method : 'password')
    setCode('')
    setPassword('')
    setSentCode('')
    setSentTarget('')
    startCountdown(0)
    setTargetError('')
    setCodeError('')
    setPasswordError('')
  }

  const switchMethod = (next: LoginMethod) => {
    setMethod(next)
    setCode('')
    setPassword('')
    setCodeError('')
    setPasswordError('')
  }

  const handleSubmit = useLockFn(async () => {
    setSubmitting(true)
    try {
      if (!validateTarget()) return

      const useCode = tab === 'phone' && method === 'code'
      let session: IAuthSession
      if (useCode) {
        if (!code.trim()) {
          setCodeError(t('auth.errors.codeEmpty'))
          return
        }
        if (!sentCode || sentTarget !== target) {
          setCodeError(t('auth.errors.codeFirst'))
          return
        }
        setCodeError('')
        session = await loginByCode(target, code.trim())
      } else {
        if (!password) {
          setPasswordError(t('auth.errors.passwordEmpty'))
          return
        }
        setPasswordError('')
        session = await login(target, password)
      }

      // 登录成功后用返回的 nodes 自动生成并激活订阅；订阅失败不阻挡进入主页
      try {
        await ensureNodeProfile(session)
      } catch (subscribeErr: any) {
        console.error('[login] 自动订阅失败:', subscribeErr)
        showNotice.error(subscribeErr?.toString?.() ?? String(subscribeErr))
      }

      // 刷新共享的代理/配置缓存：首页卡片不像代理页那样轮询，
      // 切换用户后必须主动刷新，否则首页仍显示上一个用户的节点。
      try {
        await refreshAll()
      } catch (refreshErr) {
        console.warn('[login] 刷新代理数据失败:', refreshErr)
      }

      navigate('/', { replace: true })
    } catch (err: any) {
      console.error(err)
      showNotice.error(err?.toString?.() ?? String(err))
    } finally {
      setSubmitting(false)
    }
  })

  return {
    tab,
    method,
    phone,
    email,
    code,
    password,
    countdown,
    submitting,
    targetError,
    codeError,
    passwordError,
    setPhone,
    setEmail,
    setCode,
    setPassword,
    setTargetError,
    setCodeError,
    setPasswordError,
    switchTab,
    switchMethod,
    handleGetCode,
    handleSubmit,
  }
}

export type LoginFormApi = ReturnType<typeof useLoginForm>
