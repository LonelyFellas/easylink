import {
  Box,
  Button,
  CssBaseline,
  Paper,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from '@mui/material'
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

const LoginPage = () => {
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { session, login, register } = useAuth()
  const { decorated } = useWindowDecorations()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 登录页不挂载 Layout，需自行移除 index.html 的初始加载遮罩
  useEffect(() => {
    hideInitialOverlay()
  }, [])

  const handleSubmit = useLockFn(async () => {
    if (!username.trim() || !password) {
      showNotice.error(t('auth.errors.empty'))
      return
    }
    if (mode === 'register' && password !== confirm) {
      showNotice.error(t('auth.errors.mismatch'))
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password)
      }
      navigate('/', { replace: true })
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

          <Tabs
            value={mode}
            onChange={(_, v: Mode) => setMode(v)}
            sx={{ alignSelf: 'stretch' }}
            variant="fullWidth"
          >
            <Tab value="login" label={t('auth.login')} />
            <Tab value="register" label={t('auth.register')} />
          </Tabs>

          <TextField
            fullWidth
            size="small"
            label={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <TextField
            fullWidth
            size="small"
            type="password"
            label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mode === 'login') void handleSubmit()
            }}
          />
          {mode === 'register' && (
            <TextField
              fullWidth
              size="small"
              type="password"
              label={t('auth.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}

          <Button
            fullWidth
            variant="contained"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            sx={{ mt: 1 }}
          >
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </Button>
        </Paper>
      </Box>
    </ThemeProvider>
  )
}

export default LoginPage
