import { openWebUrl } from './cmds'

/** 官网充值 / 升级套餐页面（默认浏览器打开） */
export const RECHARGE_URL = 'https://www.easylinkvpn.com/#/Index'

export const openRecharge = () => openWebUrl(RECHARGE_URL)
