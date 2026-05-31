import { Box, Button, Link, Tab, Tabs, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { PhoneField } from './phone-field'
import type { RegisterTab } from './types'
import { useRegisterForm } from './use-register-form'

interface Props {
  onSwitchToLogin: () => void
}

export const RegisterForm = ({ onSwitchToLogin }: Props) => {
  const { t } = useTranslation()
  const f = useRegisterForm()

  return (
    <>
      <Tabs
        value={f.tab}
        onChange={(_, v: RegisterTab) => f.switchTab(v)}
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
          helperText={f.targetError || ' '}
        />
      )}

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

      <TextField
        fullWidth
        size="medium"
        type="password"
        label={t('auth.password')}
        value={f.password}
        onChange={(e) => {
          f.setPassword(e.target.value)
          if (f.passwordError) f.setPasswordError('')
          if (f.confirmError) f.setConfirmError('')
        }}
        error={Boolean(f.passwordError)}
        helperText={f.passwordError || undefined}
      />
      <TextField
        fullWidth
        size="medium"
        type="password"
        label={t('auth.confirmPassword')}
        value={f.confirm}
        onChange={(e) => {
          f.setConfirm(e.target.value)
          if (f.confirmError) f.setConfirmError('')
        }}
        disabled={f.tab === 'phone' && !f.password}
        error={Boolean(f.confirmError)}
        helperText={f.confirmError || undefined}
      />

      <Button
        fullWidth
        size="large"
        variant="contained"
        disabled={f.submitting}
        onClick={() => void f.handleSubmit()}
        sx={{ mt: 1, py: 1.25, fontSize: '1rem' }}
      >
        {t('auth.register')}
      </Button>

      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={onSwitchToLogin}
      >
        {t('auth.backToLogin')}
      </Link>
    </>
  )
}
