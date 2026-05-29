import {
  AccountBalanceWalletOutlined,
  PersonOutlineRounded,
} from '@mui/icons-material'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'

import { useAuth } from '@/providers/auth-context'
import { openWebUrl } from '@/services/cmds'

import { EnhancedCard } from './enhanced-card'
import { RECHARGE_URL } from './recharge'

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

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        fontWeight: 'medium',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={value}
    >
      {value}
    </Typography>
  </Stack>
)

export const LoginStatusCard = () => {
  const { session } = useAuth()

  const recharge = useLockFn(() => openWebUrl(RECHARGE_URL))

  const account = maskAccount(session?.username)
  const expiry = formatExpiry(session?.vip_end_time || session?.expire_in)

  return (
    <EnhancedCard
      title="登录状态"
      icon={<PersonOutlineRounded />}
      iconColor="success"
      action={
        <Button
          variant="contained"
          size="small"
          startIcon={<AccountBalanceWalletOutlined />}
          onClick={recharge}
          sx={{ borderRadius: 1.5 }}
        >
          充值
        </Button>
      }
    >
      <Stack spacing={1.5}>
        <InfoRow label="当前账号" value={account} />
        <InfoRow label="到期时间" value={expiry} />
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              mr: 1,
            }}
          />
          <Typography
            variant="body2"
            color="success.main"
            sx={{ fontWeight: 'medium' }}
          >
            已登录
          </Typography>
        </Box>
      </Stack>
    </EnhancedCard>
  )
}
