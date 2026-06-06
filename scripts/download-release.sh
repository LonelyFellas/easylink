#!/usr/bin/env bash
#
# 下载指定 GitHub Release tag 下的所有资源文件（assets）。
#
# 用法:
#   ./scripts/download-release.sh [TAG] [输出目录]
#
# 示例:
#   ./scripts/download-release.sh                 # 默认下载 v1.1.5 到 ./release-v1.1.5
#   ./scripts/download-release.sh v1.1.4          # 下载 v1.1.4
#   ./scripts/download-release.sh v1.1.5 ~/Downloads/el
#
# 私有仓库 / 限流时可设置令牌:
#   export GITHUB_TOKEN=ghp_xxx
#
set -euo pipefail

REPO="LonelyFellas/easylink"
TAG="${1:-v1.1.5}"

# 项目根目录 = 本脚本所在目录的上一级
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 默认下载到 <项目根>/target/<TAG>/，TAG 动态
OUT_DIR="${2:-${ROOT_DIR}/target/${TAG}}"

API="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"

# 组装鉴权头（可选）
AUTH=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

echo "==> 仓库:  ${REPO}"
echo "==> Tag:   ${TAG}"
echo "==> 输出:  ${OUT_DIR}"
echo "==> 查询 release 信息..."

# 拉取 release 元数据
META="$(curl -fsSL --retry 5 --retry-all-errors ${AUTH[@]+"${AUTH[@]}"} -H "Accept: application/vnd.github+json" "${API}")" || {
  echo "❌ 获取 release 失败，请确认 tag ${TAG} 是否存在。" >&2
  exit 1
}

# 解析每个 asset 的「名称<TAB>下载地址」（兼容 bash 3.2，无 mapfile）
ASSETS=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && ASSETS+=("${line}")
done < <(echo "${META}" | jq -r '.assets[] | "\(.name)\t\(.browser_download_url)"')

if [[ "${#ASSETS[@]}" -eq 0 ]]; then
  echo "⚠️  该 release 没有任何 assets。"
  exit 0
fi

echo "==> 共 ${#ASSETS[@]} 个文件，开始下载..."
mkdir -p "${OUT_DIR}"

# 优先用 aria2c 做单文件分片（多连接并发）下载，没有则回退 curl
USE_ARIA2=0
if command -v aria2c >/dev/null 2>&1; then
  USE_ARIA2=1
  echo "==> 检测到 aria2c，启用分片下载（每文件 16 连接）"
else
  echo "==> 未检测到 aria2c，使用 curl 单连接下载（建议 brew install aria2 以启用分片）"
fi

# aria2 鉴权头
ARIA_AUTH=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  ARIA_AUTH=(--header="Authorization: Bearer ${GITHUB_TOKEN}")
fi

i=0
for line in "${ASSETS[@]}"; do
  i=$((i + 1))
  name="${line%%$'\t'*}"
  url="${line#*$'\t'}"
  dest="${OUT_DIR}/${name}"

  echo "[${i}/${#ASSETS[@]}] ${name}"

  if [[ "${USE_ARIA2}" -eq 1 ]]; then
    # -x16 单服务器最多 16 连接；-s16 切 16 段；-k1M 每段最小 1M；--continue 断点续传
    aria2c -x16 -s16 -k1M --continue=true --auto-file-renaming=false \
      --max-tries=5 --retry-wait=2 ${ARIA_AUTH[@]+"${ARIA_AUTH[@]}"} \
      -d "${OUT_DIR}" -o "${name}" "${url}" || {
        echo "  ⚠️  下载失败: ${name}" >&2
      }
  else
    # -C - 断点续传；默认 HTTP/2，失败降级 HTTP/1.1 重试
    if ! curl -fL --retry 5 --retry-all-errors -C - ${AUTH[@]+"${AUTH[@]}"} -o "${dest}" "${url}"; then
      echo "  ↻ HTTP/2 失败，改用 HTTP/1.1 重试..."
      curl -fL --http1.1 --retry 5 --retry-all-errors -C - ${AUTH[@]+"${AUTH[@]}"} -o "${dest}" "${url}" || {
        echo "  ⚠️  下载失败: ${name}" >&2
      }
    fi
  fi
done

echo "==> 下载完成，文件已保存到: ${OUT_DIR}"
ls -lh "${OUT_DIR}"

# 打包成 zip 放到 <项目根>/target/zips/<TAG>.zip
ZIP_DIR="${ROOT_DIR}/target/zips"
ZIP_PATH="${ZIP_DIR}/${TAG}.zip"
mkdir -p "${ZIP_DIR}"

echo "==> 打包: ${ZIP_PATH}"
# -j 不保留目录层级，只把文件压进 zip 根；如需保留目录可去掉 -j
( cd "${OUT_DIR}" && rm -f "${ZIP_PATH}" && zip -rq "${ZIP_PATH}" . )

echo "==> 打包完成:"
ls -lh "${ZIP_PATH}"
