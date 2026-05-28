import {
  Box,
  CssBaseline,
  Paper,
  ThemeProvider,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'

import LogoSvg from '@/assets/image/logo.svg?react'
import { WindowControls } from '@/components/layout/window-controller'
import { useWindowDecorations } from '@/hooks/use-window'
import { useAuth } from '@/providers/auth-context'

import { useCustomTheme } from './_layout/hooks'
import { hideInitialOverlay } from './_layout/utils'
import { LoginForm } from './_login/login-form'
import { RegisterForm } from './_login/register-form'
import type { Mode } from './_login/types'

const LoginPage = () => {
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { session } = useAuth()
  const { decorated } = useWindowDecorations()

  const [mode, setMode] = useState<Mode>('login')

  // 登录页不挂载 Layout，需自行移除 index.html 的初始加载遮罩
  useEffect(() => {
    hideInitialOverlay()
  }, [])

  if (session) return <Navigate to="/" replace />

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
            width: 440,
            p: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2.5,
            borderRadius: 3,
          }}
        >
          <Box sx={{ width: 72, height: 72, mb: 1 }}>
            <LogoSvg style={{ width: '100%', height: '100%' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {t('auth.title')}
          </Typography>

          {mode === 'login' ? (
            <LoginForm onSwitchToRegister={() => setMode('register')} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setMode('login')} />
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  )
}

export default LoginPage
