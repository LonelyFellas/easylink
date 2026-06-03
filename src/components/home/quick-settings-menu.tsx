import { TuneRounded } from '@mui/icons-material'
import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Stack,
  Switch,
  Tooltip,
  Typography,
  styled,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ThemeModeSwitch } from '@/components/setting/mods/theme-mode-switch'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useVerge } from '@/hooks/use-verge'
import { supportedLanguages } from '@/services/i18n'
import { showNotice } from '@/services/notice-service'

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  fa: 'فارسی',
  tt: 'Татар',
  id: 'Bahasa Indonesia',
  ar: 'العربية',
  ko: '한국어',
  tr: 'Türkçe',
  de: 'Deutsch',
  es: 'Español',
  jp: '日本語',
  zhtw: '繁體中文',
}

const languageOptions = supportedLanguages.map((code) => ({
  code,
  label: LANGUAGE_LABELS[code] || code,
}))

interface RowProps {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

// iOS 风格的胶囊型 Switch：蓝色轨道 + 白色圆形拇指
const IOSSwitch = styled(Switch)(({ theme }) => ({
  width: 42,
  height: 24,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '250ms',
    '&.Mui-checked': {
      transform: 'translateX(18px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        backgroundColor: '#1677FF',
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color: theme.palette.grey[100],
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.3,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 20,
    height: 20,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  '& .MuiSwitch-track': {
    borderRadius: 24 / 2,
    backgroundColor: theme.palette.mode === 'dark' ? '#39393D' : '#E5E5EA',
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 300,
    }),
  },
}))

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
    <IOSSwitch checked={checked} onChange={(_, v) => onChange(v)} />
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

  const { enable_auto_launch, enable_silent_start, theme_mode, language } =
    verge ?? {}

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

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1,
              py: 0.5,
            }}
          >
            <Typography variant="body2">主题模式</Typography>
            <ThemeModeSwitch
              value={theme_mode}
              onChange={(v) => patchFlag({ theme_mode: v })}
            />
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1,
              py: 0.5,
            }}
          >
            <Typography variant="body2">
              {t('settings.components.verge.basic.fields.language')}
            </Typography>
            <Select
              size="small"
              value={language ?? 'en'}
              onChange={(e) =>
                patchFlag({ language: e.target.value as string })
              }
              sx={{ width: 140, '> div': { py: '6px' } }}
            >
              {languageOptions.map(({ code, label }) => (
                <MenuItem key={code} value={code}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Stack>
      </Popover>
    </>
  )
}
