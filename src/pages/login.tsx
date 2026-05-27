import {
  Box,
  Button,
  CssBaseline,
  Link,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'

import LogoSvg from '@/assets/image/logo.svg?react'
import { WindowControls } from '@/components/layout/window-controller'
import { useWindowDecorations } from '@/hooks/use-window'
import { useAuth } from '@/providers/auth-context'
import { showNotice } from '@/services/notice-service'

import { useCustomTheme } from './_layout/hooks'
import { hideInitialOverlay } from './_layout/utils'

type Mode = 'login' | 'register'
type RegisterTab = 'phone' | 'email'

const COUNTRY_CODES = ['+86', '+852', '+886', '+1', '+81', '+44']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LoginPage = () => {
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { session, login, register } = useAuth()
  const { decorated } = useWindowDecorations()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [registerTab, setRegisterTab] = useState<RegisterTab>('phone')

  // 登录
  const [identifier, setIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // 注册
  const [countryCode, setCountryCode] = useState('+86')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  // 客户端 Mock 验证码：记录已发送的码与目标，校验一致性
  const [sentCode, setSentCode] = useState('')
  const [sentTarget, setSentTarget] = useState('')
  const [countdown, setCountdown] = useState(0)

  const [submitting, setSubmitting] = useState(false)

  // 登录页不挂载 Layout，需自行移除 index.html 的初始加载遮罩
  useEffect(() => {
    hideInitialOverlay()
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // 注册目标：手机号或邮箱，作为后端账号标识
  const registerTarget = registerTab === 'phone' ? phone.trim() : email.trim()

  const validateRegisterTarget = () => {
    if (registerTab === 'phone') {
      if (!phone.trim()) {
        showNotice.error('auth.errors.phoneEmpty')
        return false
      }
      return true
    }
    if (!email.trim()) {
      showNotice.error('auth.errors.emailEmpty')
      return false
    }
    if (!EMAIL_RE.test(email.trim())) {
      showNotice.error('auth.errors.emailInvalid')
      return false
    }
    return true
  }

  const handleGetCode = async () => {
    if (countdown > 0) return
    if (!validateRegisterTarget()) return
    // 调用rust tauri api 获取验证码
    const result = await invoke('get_verify_code', { phone: registerTarget })
    console.log(result)
  }

  const switchRegisterTab = (tab: RegisterTab) => {
    setRegisterTab(tab)
    setCode('')
    setSentCode('')
    setSentTarget('')
    setCountdown(0)
  }

  const handleLogin = async () => {
    if (!identifier.trim() || !loginPassword) {
      showNotice.error('auth.errors.empty')
      return
    }
    await login(identifier.trim(), loginPassword)
    navigate('/', { replace: true })
  }

  const handleRegister = async () => {
    if (!validateRegisterTarget()) return
    if (!sentCode || sentTarget !== registerTarget) {
      showNotice.error('auth.errors.codeFirst')
      return
    }
    if (!code.trim()) {
      showNotice.error('auth.errors.codeEmpty')
      return
    }
    if (code.trim() !== sentCode) {
      showNotice.error('auth.errors.codeMismatch')
      return
    }
    if (!password) {
      showNotice.error('auth.errors.empty')
      return
    }
    if (password !== confirm) {
      showNotice.error('auth.errors.mismatch')
      return
    }
    await register(registerTarget, password)
    navigate('/', { replace: true })
  }

  const handleSubmit = useLockFn(async () => {
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await handleLogin()
      } else {
        await handleRegister()
      }
    } catch (err: any) {
      showNotice.error(err?.toString?.() ?? String(err))
    } finally {
      setSubmitting(false)
    }
  })

  // 已登录则不应停留在登录页
  if (session) {
    return <Navigate to="/" replace />
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!decorated && (
        <div className="the_titlebar">
          <div
            className="the_titlebar-drag-region"
            data-tauri-drag-region="true"
          />
          <WindowControls />
        </div>
      )}
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: 360,
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            borderRadius: 3,
          }}
        >
          <Box sx={{ width: 56, height: 56, mb: 1 }}>
            <LogoSvg style={{ width: '100%', height: '100%' }} />
          </Box>
          <Typography variant="h6">{t('auth.title')}</Typography>

          {mode === 'login' ? (
            <>
              <TextField
                fullWidth
                size="small"
                label={t('auth.identifier')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
              />
              <TextField
                fullWidth
                size="small"
                type="password"
                label={t('auth.password')}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit()
                }}
              />
              <Button
                fullWidth
                variant="contained"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                sx={{ mt: 1 }}
              >
                {t('auth.login')}
              </Button>
              <Box
                sx={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => setMode('register')}
                >
                  {t('auth.registerAccount')}
                </Link>
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => showNotice.info('auth.forgotHint')}
                >
                  {t('auth.forgotPassword')}
                </Link>
              </Box>
            </>
          ) : (
            <>
              <Tabs
                value={registerTab}
                onChange={(_, v: RegisterTab) => switchRegisterTab(v)}
                sx={{ alignSelf: 'stretch' }}
                variant="fullWidth"
              >
                <Tab value="phone" label={t('auth.phoneTab')} />
                <Tab value="email" label={t('auth.emailTab')} />
              </Tabs>

              {registerTab === 'phone' ? (
                <Box sx={{ alignSelf: 'stretch', display: 'flex', gap: 1 }}>
                  <TextField
                    select
                    size="small"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    sx={{ width: 96 }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('auth.phone')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Box>
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  label={t('auth.email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}

              <Box sx={{ alignSelf: 'stretch', display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('auth.verifyCode')}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  variant="outlined"
                  disabled={countdown > 0}
                  onClick={handleGetCode}
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {countdown > 0
                    ? t('auth.resendIn', { sec: countdown })
                    : t('auth.getCode')}
                </Button>
              </Box>

              <TextField
                fullWidth
                size="small"
                type="password"
                label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                type="password"
                label={t('auth.confirmPassword')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              <Button
                fullWidth
                variant="contained"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                sx={{ mt: 1 }}
              >
                {t('auth.register')}
              </Button>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setMode('login')}
              >
                {t('auth.backToLogin')}
              </Link>
            </>
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  )
}

export default LoginPage
