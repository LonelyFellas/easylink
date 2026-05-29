import { LogoutRounded } from '@mui/icons-material'
import { Button, Chip } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/providers/auth-context'
import { showNotice } from '@/services/notice-service'

import { SettingItem, SettingList } from './mods/setting-comp'

interface Props {
  onError?: (err: Error) => void
}

const VIP_COLOR_MAP: Record<string, 'default' | 'primary' | 'warning'> = {
  svip: 'warning',
  vip: 'primary',
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

  const vipType = session?.vip_type
  const identityChip = (
    <Chip
      size="small"
      label={vipType ? vipType.toUpperCase() : '普通用户'}
      color={vipType ? (VIP_COLOR_MAP[vipType] ?? 'default') : 'default'}
      variant={vipType ? 'filled' : 'outlined'}
      sx={{ ml: 1, height: 20 }}
    />
  )

  return (
    <SettingList title={t('auth.account')}>
      <SettingItem
        label={t('auth.username')}
        extra={identityChip}
        secondary={
          session?.vip_end_time
            ? `${session.username ?? '-'} · 到期 ${session.vip_end_time}`
            : (session?.username ?? '-')
        }
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
