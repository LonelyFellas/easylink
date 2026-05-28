// 目前仅支持中国大陆 +86，后续如需多区码可恢复 select 控件
export const PHONE_PREFIX = '+86'
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 兼容多国号段：仅数字，长度 6~15
export const PHONE_RE = /^\d{6,15}$/
// 验证码倒计时秒数
export const CODE_COUNTDOWN_SEC = 60
