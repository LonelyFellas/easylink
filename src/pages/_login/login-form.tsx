import { Box, Button, Link, Tab, Tabs, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { showNotice } from '@/services/notice-service'

import { PhoneField } from './phone-field'
import type { LoginTab } from './types'
import { useLoginForm } from './use-login-form'

interface Props {
  onSwitchToRegister: () => void
}

export const LoginForm = ({ onSwitchToRegister }: Props) => {
  const { t } = useTranslation()
  const f = useLoginForm()

  const useCode = f.tab === 'phone' && f.method === 'code'

  return (
    <>
      <Tabs
        value={f.tab}
        onChange={(_, v: LoginTab) => f.switchTab(v)}
        sx={{ alignSelf: 'stretch' }}
        variant="fullWidth"
      >
        <Tab value="phone" label={t('auth.phoneTab')} />
        <Tab value="email" label={t('auth.emailTab')} />
      </Tabs>

      {f.tab === 'phone' ? (
        <PhoneField
          label={t('auth.phone')}
          value={f.phone}
          onChange={(v) => {
            f.setPhone(v)
            if (f.targetError) f.setTargetError('')
          }}
          error={f.targetError}
          autoFocus
        />
      ) : (
        <TextField
          fullWidth
          size="medium"
          label={t('auth.email')}
          value={f.email}
          onChange={(e) => {
            f.setEmail(e.target.value)
            if (f.targetError) f.setTargetError('')
          }}
          error={Boolean(f.targetError)}
          helperText={f.targetError || undefined}
          autoFocus
        />
      )}

      {useCode ? (
        <Box
          sx={{
            alignSelf: 'stretch',
            display: 'flex',
            gap: 1,
            alignItems: 'flex-start',
          }}
        >
          <TextField
            fullWidth
            size="medium"
            label={t('auth.verifyCode')}
            value={f.code}
            onChange={(e) => {
              f.setCode(e.target.value)
              if (f.codeError) f.setCodeError('')
            }}
            error={Boolean(f.codeError)}
            helperText={f.codeError || undefined}
          />
          <Button
            variant="outlined"
            disabled={f.countdown > 0}
            onClick={f.handleGetCode}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0, px: 2 }}
          >
            {f.countdown > 0
              ? t('auth.resendIn', { sec: f.countdown })
              : t('auth.getCode')}
          </Button>
        </Box>
      ) : (
        <TextField
          fullWidth
          size="medium"
          type="password"
          label={t('auth.password')}
          value={f.password}
          onChange={(e) => {
            f.setPassword(e.target.value)
            if (f.passwordError) f.setPasswordError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void f.handleSubmit()
          }}
          error={Boolean(f.passwordError)}
          helperText={f.passwordError || undefined}
        />
      )}

      <Button
        fullWidth
        size="large"
        variant="contained"
        disabled={f.submitting}
        onClick={() => void f.handleSubmit()}
        sx={{ mt: 1, py: 1.25, fontSize: '1rem' }}
      >
        {t('auth.login')}
      </Button>

      <Box
        sx={{
          alignSelf: 'stretch',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: -0.5,
        }}
      >
        <span />
        <Link
          component="button"
          type="button"
          underline="hover"
          color="text.secondary"
          sx={{ fontSize: 14 }}
          onClick={() => showNotice.info('auth.forgotHint')}
        >
          {t('auth.forgotPassword')}
        </Link>
      </Box>

      <Box
        sx={{
          alignSelf: 'stretch',
          display: 'flex',
          justifyContent: 'center',
          gap: 0.5,
          color: 'text.secondary',
          fontSize: 14,
        }}
      >
        <span>{t('auth.noAccount')}</span>
        <Link
          component="button"
          type="button"
          underline="hover"
          sx={{ fontSize: 14, fontWeight: 500 }}
          onClick={onSwitchToRegister}
        >
          {t('auth.registerAccount')}
        </Link>
      </Box>
    </>
  )
}
