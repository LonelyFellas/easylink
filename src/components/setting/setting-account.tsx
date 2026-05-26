import { LogoutRounded } from '@mui/icons-material'
import { Button } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/providers/auth-context'
import { showNotice } from '@/services/notice-service'

import { SettingItem, SettingList } from './mods/setting-comp'

interface Props {
  onError?: (err: Error) => void
}

const SettingAccount = ({ onError }: Props) => {
  const { t } = useTranslation()
  const { session, logout } = useAuth()

  const handleLogout = useLockFn(async () => {
    try {
      // 登出后 session 置空，RequireAuth 会自动跳转到登录页
      await logout()
    } catch (err: any) {
      onError?.(err)
      showNotice.error(err)
    }
  })

  return (
    <SettingList title={t('auth.account')}>
      <SettingItem
        label={t('auth.username')}
        secondary={session?.username ?? '-'}
      >
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<LogoutRounded />}
          onClick={handleLogout}
        >
          {t('auth.logout')}
        </Button>
      </SettingItem>
    </SettingList>
  )
}

export default SettingAccount
