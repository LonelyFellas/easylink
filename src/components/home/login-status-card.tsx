import {
  AccountBalanceWalletOutlined,
  PersonOutlineRounded,
  RefreshRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { useMutation } from '@tanstack/react-query'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/providers/auth-context'
import { openRecharge } from '@/services/recharge'

import { EnhancedCard } from './enhanced-card'

const VIP_COLOR_MAP: Record<string, 'primary' | 'warning'> = {
  svip: 'warning',
  vip: 'primary',
}

/** 账号脱敏：邮箱保留首字母 + 域名；手机号保留前 3 后 2 位 */
const maskAccount = (account?: string) => {
  if (!account) return '-'
  const at = account.indexOf('@')
  if (at > 0) {
    return `${account.slice(0, 1)}***${account.slice(at)}`
  }
  if (account.length <= 4) return `${account.slice(0, 1)}***`
  return `${account.slice(0, 3)}****${account.slice(-2)}`
}

const formatExpiry = (value?: string) => {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value
}

export const LoginStatusCard = () => {
  const { t } = useTranslation()
  const { userDetail, refreshUserDetail, session } = useAuth()

  const cardTitle = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography variant="h6" sx={{ fontWeight: 'medium', fontSize: 18 }}>
        {t('home.components.loginStatus.title')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'success.main',
            mr: 0.5,
          }}
        />
        <Typography
          variant="caption"
          color="success.main"
          sx={{ fontWeight: 'medium' }}
        >
          {t('home.components.loginStatus.statuses.loggedIn')}
        </Typography>
      </Box>
    </Box>
  )
  const {
    mutateAsync: refreshUserDetailMutation,
    isPending: isRefreshingUserDetail,
  } = useMutation({
    mutationFn: refreshUserDetail,
  })

  const recharge = useLockFn(() => openRecharge())

  const account = maskAccount(userDetail?.username || session?.username)
  const expiry = formatExpiry(
    userDetail?.vip_end_time || userDetail?.expire_in || session?.expire_in,
  )
  const vipType = userDetail?.vip_type || session?.vip_type

  return (
    <EnhancedCard
      title={cardTitle}
      icon={<PersonOutlineRounded />}
      iconColor="success"
      action={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            loading={isRefreshingUserDetail}
            onClick={() => refreshUserDetailMutation()}
            title={t('home.components.loginStatus.actions.refreshDetail')}
            disabled={isRefreshingUserDetail}
          >
            {isRefreshingUserDetail ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <RefreshRounded color="inherit" />
            )}
          </IconButton>
          <Button
            variant="contained"
            size="small"
            startIcon={<AccountBalanceWalletOutlined />}
            onClick={recharge}
            sx={{ borderRadius: 1.5 }}
          >
            {t('home.components.loginStatus.actions.recharge')}
          </Button>
        </Box>
      }
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            {t('home.components.loginStatus.labels.account')}:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 'medium',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={account}
          >
            {account}
          </Typography>
          <Chip
            size="small"
            label={
              vipType
                ? vipType.toUpperCase()
                : t('home.components.loginStatus.labels.normalUser')
            }
            color={
              vipType
                ? (VIP_COLOR_MAP[vipType.toLowerCase()] ?? 'default')
                : 'default'
            }
            variant={vipType ? 'filled' : 'outlined'}
            sx={{ height: 20, flexShrink: 0 }}
          />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            {t('home.components.loginStatus.labels.expireTime')}:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 'medium',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={expiry}
          >
            {expiry}
          </Typography>
        </Stack>
      </Stack>
    </EnhancedCard>
  )
}
