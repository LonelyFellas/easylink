import { context, getOctokit } from '@actions/github'
import fetch from 'node-fetch'

import { resolveUpdateLog } from './updatelog.mjs'

// 国内加速镜像前缀，需与 updater.mjs 保持一致。
const PROXY_PREFIX = 'https://gh-proxy.org/'

const UPDATE_TAG_NAME = 'updater'
const UPDATE_JSON_FILE = 'update-fixed-webview2.json'
const UPDATE_JSON_PROXY = 'update-fixed-webview2-proxy.json'

// 按 semver 从大到小比较（tag 形如 vX.Y.Z），用于挑选最新版本
function compareSemverDesc(a, b) {
  const parse = (name) => name.replace(/^v/, '').split('.').map(Number)
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  return b1 - a1 || b2 - a2 || b3 - a3
}

/// generate update.json
/// upload to update tag's release asset
async function resolveUpdater() {
  if (process.env.GITHUB_TOKEN === undefined) {
    throw new Error('GITHUB_TOKEN is required')
  }

  // 支持跨仓库发布：私有源码仓库 → 公开发布仓库
  const options = {
    owner: process.env.PUBLISH_OWNER || context.repo.owner,
    repo: process.env.PUBLISH_REPO || context.repo.repo,
  }
  console.log(`Target release repo: ${options.owner}/${options.repo}`)
  const github = getOctokit(process.env.GITHUB_TOKEN)

  // 分页拉取全部 tag。只取前 10 个会在 tag 数超过 10 时漏掉最新版本，
  // 导致 tag 为 undefined、清单文件没生成，进而 OSS 上传报 no such file。
  let allTags = []
  let page = 1
  while (true) {
    const { data: pageTags } = await github.rest.repos.listTags({
      ...options,
      per_page: 100,
      page,
    })
    allTags = allTags.concat(pageTags)
    if (pageTags.length < 100) break
    page++
  }

  // get the latest publish tag
  // GitHub listTags 不保证按版本号排序，必须自己按 semver 取最高版本
  const tag = allTags
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t.name))
    .sort((a, b) => compareSemverDesc(a.name, b.name))[0]

  if (!tag) {
    throw new Error('No stable vX.Y.Z tag found for fixed-webview2 updater')
  }

  console.log(tag)
  console.log()

  const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: tag.name,
  })

  const updateData = {
    name: tag.name,
    notes: await resolveUpdateLog(tag.name).catch(
      () => 'No changelog available',
    ), // use Changelog.md
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': { signature: '', url: '' },
      'windows-aarch64': { signature: '', url: '' },
      'windows-x86': { signature: '', url: '' },
      'windows-i686': { signature: '', url: '' },
    },
  }

  const promises = latestRelease.assets.map(async (asset) => {
    const { name, browser_download_url } = asset

    // win64 url
    if (name.endsWith('x64_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-x86_64'].url = browser_download_url
    }
    // win64 signature
    if (name.endsWith('x64_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-x86_64'].signature = sig
    }

    // win32 url
    if (name.endsWith('x86_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-x86'].url = browser_download_url
      updateData.platforms['windows-i686'].url = browser_download_url
    }
    // win32 signature
    if (name.endsWith('x86_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-x86'].signature = sig
      updateData.platforms['windows-i686'].signature = sig
    }

    // win arm url
    if (name.endsWith('arm64_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-aarch64'].url = browser_download_url
    }
    // win arm signature
    if (name.endsWith('arm64_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-aarch64'].signature = sig
    }
  })

  await Promise.allSettled(promises)
  console.log(updateData)

  // maybe should test the signature as well
  // delete the null field
  Object.entries(updateData.platforms).forEach(([key, value]) => {
    if (!value.url) {
      console.log(`[Error]: failed to parse release for "${key}"`)
      delete updateData.platforms[key]
    }
  })

  // 生成走国内镜像的代理清单：把 GitHub 安装包地址用 gh-proxy 前缀包一层
  const updateDataNew = JSON.parse(JSON.stringify(updateData))

  Object.entries(updateDataNew.platforms).forEach(([key, value]) => {
    if (value.url) {
      updateDataNew.platforms[key].url = `${PROXY_PREFIX}${value.url}`
    } else {
      console.log(`[Error]: updateDataNew.platforms.${key} is null`)
    }
  })

  // update the update.json
  const { data: updateRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: UPDATE_TAG_NAME,
  })

  // delete the old assets
  for (const asset of updateRelease.assets) {
    if (asset.name === UPDATE_JSON_FILE) {
      await github.rest.repos.deleteReleaseAsset({
        ...options,
        asset_id: asset.id,
      })
    }

    if (asset.name === UPDATE_JSON_PROXY) {
      await github.rest.repos
        .deleteReleaseAsset({ ...options, asset_id: asset.id })
        .catch(console.error) // do not break the pipeline
    }
  }

  // upload new assets
  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_FILE,
    data: JSON.stringify(updateData, null, 2),
  })

  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_PROXY,
    data: JSON.stringify(updateDataNew, null, 2),
  })
}

// get the signature file content
async function getSignature(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' },
  })

  return response.text()
}

// 真正失败时以非 0 退出，避免错误被吞掉后 job 仍显示绿色（之前就因此漏掉了 bug）。
resolveUpdater().catch((e) => {
  console.error(e)
  process.exit(1)
})
