import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useState } from 'react'

import { openRecharge } from '@/services/recharge'

/**
 * 节点超出会员身份时的「升级会员」弹窗。
 * 返回触发器 `promptRecharge` 和待渲染的 `rechargeDialog`，供首页/代理页复用，
 * 弹窗文案集中在此处，避免多处拷贝改不同步。
 */
export function useRechargeDialog() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const promptRecharge = useCallback(() => setOpen(true), [])
  const handleRecharge = useLockFn(async () => {
    setOpen(false)
    await openRecharge()
  })

  const rechargeDialog = (
    <Dialog open={open} onClose={close}>
      <DialogTitle>升级会员</DialogTitle>
      <DialogContent>
        <DialogContentText>
          该节点需要更高等级的会员，请前往官网充值升级后使用。
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>取消</Button>
        <Button variant="contained" onClick={handleRecharge}>
          去充值
        </Button>
      </DialogActions>
    </Dialog>
  )

  return { promptRecharge, rechargeDialog }
}
