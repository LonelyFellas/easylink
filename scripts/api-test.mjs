// 接口测试

import axios from 'axios'

const baseUrl = 'https://vdev.dv333.online/'

// 短信验证码
// const response1 = await axios.post(`${baseUrl}/api/sendsms`, {
//   phone: '15257294120',
// })
// console.log(response1.data)

// 注册
const response2 = await axios.post(`${baseUrl}/api/register`, {
  username: '15257294120',
  password: 'admin',
  repassword: 'admin',
  device_id: 3,
  key: '983125',
})
console.log(response2.data)
