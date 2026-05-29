import { WorkspacePremiumOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import { useLockFn } from 'ahooks'

import { useAuth } from '@/providers/auth-context'
import { openRecharge } from '@/services/recharge'

import { EnhancedCard } from './enhanced-card'

interface Tier {
  key: string
  label: string
  desc: string
  rank: number
}

const TIERS: Tier[] = [
  { key: 'vip', label: 'VIP', desc: '高速稳定线路', rank: 1 },
  { key: 'svip', label: 'SVIP', desc: '专属高速线路 · 更低延迟', rank: 2 },
]

export const MembershipCard = () => {
  const theme = useTheme()
  const { session } = useAuth()

  const upgrade = useLockFn(() => openRecharge())

  const currentKey = session?.vip_type?.toLowerCase()
  const currentRank = TIERS.find((tier) => tier.key === currentKey)?.rank ?? 0

  const subtitle = currentKey
    ? `${currentKey.toUpperCase()} 已开启 · SVIP 可升级解锁高速线路`
    : '开通会员解锁高速线路'

  return (
    <EnhancedCard
      title="会员套餐"
      icon={<WorkspacePremiumOutlined />}
      iconColor="warning"
    >
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
        <Stack direction="row" spacing={1.5}>
          {TIERS.map((tier) => {
            const active = currentRank === tier.rank
            const upgradable = tier.rank > currentRank
            return (
              <Box
                key={tier.key}
                sx={{
                  flex: 1,
                  p: 1.5,
                  borderRadius: 2,
                  border: 2,
                  borderColor: active ? 'primary.main' : 'divider',
                  backgroundColor: active
                    ? alpha(theme.palette.primary.main, 0.08)
                    : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    variant="subtitle1"
                    color={active ? 'primary.main' : 'text.primary'}
                    sx={{ fontWeight: 'bold' }}
                  >
                    {tier.label}
                  </Typography>
                  {active && (
                    <Chip
                      size="small"
                      label="当前"
                      color="primary"
                      sx={{ height: 20 }}
                    />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {tier.desc}
                </Typography>
                {upgradable && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={upgrade}
                    sx={{ borderRadius: 1.5, mt: 'auto' }}
                  >
                    升级
                  </Button>
                )}
              </Box>
            )
          })}
        </Stack>
      </Stack>
    </EnhancedCard>
  )
}
