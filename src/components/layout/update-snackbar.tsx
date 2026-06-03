import {
  ChevronRightRounded,
  SystemUpdateAltRounded,
} from '@mui/icons-material'
import { Box, Paper, Snackbar, Typography } from '@mui/material'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef } from '@/components/base'
import { useUpdate } from '@/hooks/use-update'

import { UpdateViewer } from '../setting/mods/update-viewer'

/**
 * 检测到新版本时，左下角常驻浮起的提示卡片。
 * 点击卡片打开 UpdateViewer 对话框（含更新日志与下载进度）。
 */
export const UpdateSnackbar = () => {
  const { t } = useTranslation()
  const viewerRef = useRef<DialogRef>(null)

  const { updateInfo } = useUpdate()

  const version = updateInfo?.version
  const open = !!updateInfo?.available

  return (
    <>
      <UpdateViewer ref={viewerRef} />

      <Snackbar
        open={open}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        // 让 UpdateViewer 对话框（modal）层级高于本提示卡片
        sx={(theme) => ({ zIndex: theme.zIndex.modal - 1 })}
      >
        <Paper
          elevation={0}
          onClick={() => viewerRef.current?.open()}
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            width: 300,
            p: 1.5,
            pr: 1,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            cursor: 'pointer',
            bgcolor:
              theme.palette.mode === 'dark'
                ? theme.palette.grey[900]
                : theme.palette.grey[100],
            color: 'text.primary',
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 8px 24px rgba(0,0,0,0.45)'
                : '0 8px 24px rgba(0,0,0,0.12)',
            transition: theme.transitions.create(['background-color']),
            '&:hover': {
              bgcolor:
                theme.palette.mode === 'dark'
                  ? theme.palette.grey[800]
                  : theme.palette.grey[200],
            },
          })}
        >
          <Box
            sx={{
              flexShrink: 0,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}
          >
            <SystemUpdateAltRounded sx={{ fontSize: 18 }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, lineHeight: 1.4 }}
            >
              {t('settings.modals.update.snackbar.title')}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ display: 'block', color: 'text.secondary' }}
            >
              {t('settings.modals.update.snackbar.subtitle', { version })}
            </Typography>
          </Box>

          <ChevronRightRounded
            sx={{ flexShrink: 0, color: 'text.disabled' }}
          />
        </Paper>
      </Snackbar>
    </>
  )
}
