import { InputAdornment, TextField, Typography } from '@mui/material'

import { PHONE_PREFIX } from './constants'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  autoFocus?: boolean
}

/** 手机号输入框：内嵌 +86 前缀，与普通 TextField 接口一致 */
export const PhoneField = ({
  label,
  value,
  onChange,
  error,
  autoFocus,
}: Props) => (
  <TextField
    fullWidth
    size="medium"
    label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    error={Boolean(error)}
    helperText={error || undefined}
    autoFocus={autoFocus}
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start">
            <Typography
              sx={{
                color: 'text.primary',
                fontWeight: 500,
                userSelect: 'none',
                mr: 0.5,
                pr: 1,
                borderRight: '1px solid',
                borderColor: 'divider',
              }}
            >
              {PHONE_PREFIX}
            </Typography>
          </InputAdornment>
        ),
      },
    }}
  />
)
