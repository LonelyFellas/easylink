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
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/providers/auth-context'
import { openRecharge } from '@/services/recharge'

import { EnhancedCard } from './enhanced-card'

interface Tier {
  key: string
  label: string
  descKey:
    | 'home.components.membership.tiers.vip'
    | 'home.components.membership.tiers.svip'
  rank: number
}

const TIERS: Tier[] = [
  {
    key: 'vip',
    label: 'VIP',
    descKey: 'home.components.membership.tiers.vip',
    rank: 1,
  },
  {
    key: 'svip',
    label: 'SVIP',
    descKey: 'home.components.membership.tiers.svip',
    rank: 2,
  },
]

export const MembershipCard = () => {
  const theme = useTheme()
  const { t } = useTranslation()
  const { userDetail, session } = useAuth()

  const upgrade = useLockFn(() => openRecharge())

  const currentKey = (userDetail?.vip_type || session?.vip_type)?.toLowerCase()
  const currentRank = TIERS.find((tier) => tier.key === currentKey)?.rank ?? 0

  const subtitle = currentKey
    ? t('home.components.membership.subtitle.active', {
        tier: currentKey.toUpperCase(),
      })
    : t('home.components.membership.subtitle.inactive')

  return (
    <EnhancedCard
      title={t('home.components.membership.title')}
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
                      label={t('home.components.membership.labels.current')}
                      color="primary"
                      sx={{ height: 20 }}
                    />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t(tier.descKey)}
                </Typography>
                {upgradable && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={upgrade}
                    sx={{ borderRadius: 1.5, mt: 'auto' }}
                  >
                    {t('home.components.membership.actions.upgrade')}
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
