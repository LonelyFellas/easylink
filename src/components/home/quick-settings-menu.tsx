import { TuneRounded } from '@mui/icons-material'
import {
  Box,
  Divider,
  IconButton,
  Popover,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ThemeModeSwitch } from '@/components/setting/mods/theme-mode-switch'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'

interface RowProps {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

const SwitchRow = ({ label, checked, onChange }: RowProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      px: 1,
      py: 0.5,
    }}
  >
    <Typography variant="body2">{label}</Typography>
    <Switch size="small" checked={checked} onChange={(_, v) => onChange(v)} />
  </Box>
)

/**
 * 首页右上角「快捷设置」：左侧栏设置页隐藏后，把常用开关收进一个图标里。
 * 系统代理 / 开机自启 / 静默启动 / 主题模式，全部复用现有设置逻辑。
 */
export const QuickSettingsMenu = () => {
  const { t } = useTranslation()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { indicator: systemProxyOn, toggleSystemProxy } = useSystemProxyState()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const { enable_auto_launch, enable_silent_start, theme_mode } = verge ?? {}

  // 乐观更新 + 落盘；失败回滚到服务端真实状态
  const patchFlag = async (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
    try {
      await patchVerge(patch)
    } catch (err) {
      showNotice.error(err)
      mutateVerge()
    }
  }

  const handleSystemProxy = async (value: boolean) => {
    try {
      await toggleSystemProxy(value)
    } catch (err) {
      showNotice.error(err)
    }
  }

  return (
    <>
      <Tooltip title="快捷设置" arrow>
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          color="inherit"
        >
          <TuneRounded />
        </IconButton>
      </Tooltip>

      <Popover
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 280, p: 1.5 } } }}
      >
        <Stack spacing={0.25}>
          <SwitchRow
            label={t('settings.sections.proxyControl.fields.systemProxy')}
            checked={systemProxyOn}
            onChange={handleSystemProxy}
          />
          <SwitchRow
            label={t('settings.sections.system.fields.autoLaunch')}
            checked={enable_auto_launch ?? false}
            onChange={(v) => patchFlag({ enable_auto_launch: v })}
          />
          <SwitchRow
            label={t('settings.sections.system.fields.silentStart')}
            checked={enable_silent_start ?? false}
            onChange={(v) => patchFlag({ enable_silent_start: v })}
          />

          <Divider sx={{ my: 0.5 }} />

          <Box sx={{ px: 1, pb: 0.5 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              主题模式
            </Typography>
            <ThemeModeSwitch
              value={theme_mode}
              onChange={(v) => patchFlag({ theme_mode: v })}
            />
          </Box>
        </Stack>
      </Popover>
    </>
  )
}
