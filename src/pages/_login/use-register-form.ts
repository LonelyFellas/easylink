import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useAuth } from '@/providers/auth-context'
import { showNotice } from '@/services/notice-service'

import { CODE_COUNTDOWN_SEC, EMAIL_RE, PHONE_RE } from './constants'
import type { RegisterTab } from './types'
import { useCountdown } from './use-countdown'

/** 注册表单：状态 + 校验 + 提交，UI 层只消费返回值 */
export function useRegisterForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { register, getSmsCode, getEmailCode } = useAuth()

  const [tab, setTab] = useState<RegisterTab>('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  // sms 流
  const [sentCode, setSentCode] = useState('')
  const [sentTarget, setSentTarget] = useState('')
  const { countdown, start: startCountdown } = useCountdown()

  // 内联错误
  const [targetError, setTargetError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')

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
      setTargetError('')
      return true
    }
    const v = email.trim()
    if (!v) {
      setTargetError(t('auth.errors.emailEmpty'))
      return false
    }
    if (!EMAIL_RE.test(v)) {
      setTargetError(t('auth.errors.emailInvalid'))
      return false
    }
    setTargetError('')
    return true
  }

  const handleGetCode = async () => {
    if (countdown > 0) return
    if (!validateTarget()) return
    try {
      if (tab === 'phone') {
        await getSmsCode(target)
      } else {
        await getEmailCode(target)
      }
      setSentCode(target)
      setSentTarget(target)
      startCountdown(CODE_COUNTDOWN_SEC)
    } catch (err: any) {
      showNotice.error(err?.toString?.() ?? String(err))
    }
  }

  const switchTab = (next: RegisterTab) => {
    setTab(next)
    setCode('')
    setSentCode('')
    setSentTarget('')
    startCountdown(0)
    setTargetError('')
    setCodeError('')
    setPasswordError('')
    setConfirmError('')
  }

  const handleSubmit = useLockFn(async () => {
    setSubmitting(true)
    try {
      if (!validateTarget()) return

      // 验证码：手机 / 邮箱注册均必填
      if (!code.trim()) {
        setCodeError(t('auth.errors.codeEmpty'))
        return
      }
      if (!sentCode || sentTarget !== target) {
        setCodeError(t('auth.errors.codeFirst'))
        return
      }
      setCodeError('')

      // 邮箱注册：密码 / 确认密码均必填；手机注册：密码选填
      const passwordRequired = tab === 'email' || tab === 'phone'
      if (passwordRequired && !password) {
        setPasswordError(t('auth.errors.passwordEmpty'))
        return
      }
      if (passwordRequired && !confirm) {
        setConfirmError(t('auth.errors.confirmEmpty'))
        return
      }
      // 只要填了密码就必须与确认一致
      if (password && password !== confirm) {
        setConfirmError(t('auth.errors.mismatch'))
        return
      }
      setPasswordError('')
      setConfirmError('')

      await register({
        username: target,
        password,
        repassword: confirm,
        jiqi_code: code.trim(),
        // uuid
        key: crypto.randomUUID(),
      })
      navigate('/', { replace: true })
    } catch (err: any) {
      showNotice.error(err?.toString?.() ?? String(err))
    } finally {
      setSubmitting(false)
    }
  })

  return {
    tab,
    phone,
    email,
    code,
    password,
    confirm,
    countdown,
    submitting,
    targetError,
    codeError,
    passwordError,
    confirmError,
    setPhone,
    setEmail,
    setCode,
    setPassword,
    setConfirm,
    setTargetError,
    setCodeError,
    setPasswordError,
    setConfirmError,
    switchTab,
    handleGetCode,
    handleSubmit,
  }
}

export type RegisterFormApi = ReturnType<typeof useRegisterForm>
