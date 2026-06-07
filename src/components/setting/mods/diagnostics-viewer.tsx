import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'

import { BaseDialog, type DialogRef } from '@/components/base'
import {
  clearFrontendLogs,
  type FrontendLogLevel,
  useFrontendLogs,
} from '@/services/frontend-log'
import { showNotice } from '@/services/notice-service'

const LEVEL_COLOR: Record<
  FrontendLogLevel,
  'error' | 'warning' | 'info' | 'default'
> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  debug: 'default',
}

/** 前端诊断日志查看器：实时展示 mihomo 查询失败/恢复等纯前端侧异常。 */
export const DiagnosticsViewer = forwardRef<DialogRef>((_, ref) => {
  const [open, setOpen] = useState(false)
  const logs = useFrontendLogs()

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  // 最新在上，便于排查
  const ordered = useMemo(() => [...logs].reverse(), [logs])

  const copyAll = () => {
    const text = logs
      .map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.message}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      showNotice.success(
        'shared.feedback.notifications.common.copySuccess',
        1000,
      )
    })
  }

  return (
    <BaseDialog
      open={open}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          诊断日志 / Diagnostics
          <Chip label={`${logs.length}`} size="small" />
        </Box>
      }
      contentSx={{ width: 640, maxWidth: '100%', p: 0 }}
      cancelBtn="关闭"
      disableOk
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <Box sx={{ px: 2, pt: 1 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Button size="small" variant="outlined" onClick={copyAll}>
            复制全部
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={clearFrontendLogs}
          >
            清空
          </Button>
        </Stack>

        <Box
          sx={{
            height: 420,
            overflow: 'auto',
            borderRadius: 1,
            bgcolor: (t) => (t.palette.mode === 'dark' ? '#1e1f29' : '#f5f5f5'),
            p: 1,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {ordered.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ p: 2, textAlign: 'center' }}
            >
              暂无诊断日志。出现「内核通信错误 /
              暂无激活节点」时，这里会实时记录失败原因与恢复情况。
            </Typography>
          ) : (
            ordered.map((l) => (
              <Box
                key={l.id}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'baseline',
                  py: 0.3,
                  borderBottom: (t) => `1px solid ${t.palette.divider}`,
                }}
              >
                <Typography
                  component="span"
                  sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 12 }}
                >
                  {l.time}
                </Typography>
                <Chip
                  label={l.level}
                  size="small"
                  color={LEVEL_COLOR[l.level]}
                  sx={{ height: 18, fontSize: 10, flexShrink: 0 }}
                />
                <Typography
                  component="span"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    wordBreak: 'break-all',
                  }}
                >
                  {l.message}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </BaseDialog>
  )
})
