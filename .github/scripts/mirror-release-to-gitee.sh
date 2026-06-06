#!/usr/bin/env bash
#
# 把指定 GitHub Release tag 的全部产物镜像到 Gitee Releases（国内全速下载），
# 并把自动更新清单（update.json / update-fixed-webview2.json）也同步到 Gitee 的
# 固定 "updater" release，清单里的安装包地址改写成 Gitee 地址，供 App 自动更新走 Gitee。
#
# 依赖：gh、curl、jq（GitHub Actions ubuntu runner 已内置；本地需自行安装并 gh auth login）
#
# 环境变量：
#   SOURCE_REPO    GitHub 源仓库，默认 LonelyFellas/easylink
#   GITEE_OWNER    Gitee 空间地址（用户名/组织）   [必填]
#   GITEE_REPO     Gitee 仓库 path                 [必填]
#   GITEE_BRANCH   目标分支，默认 master
#   GITEE_TOKEN    Gitee 私人令牌（需 projects 权限）[必填]
#
# 用法：
#   bash mirror-release-to-gitee.sh v1.1.5
#
set -euo pipefail

TAG="${1:?用法: mirror-release-to-gitee.sh <tag>}"
SOURCE_REPO="${SOURCE_REPO:-LonelyFellas/easylink}"
API="https://gitee.com/api/v5"
OWNER="${GITEE_OWNER:?需要环境变量 GITEE_OWNER}"
REPO="${GITEE_REPO:?需要环境变量 GITEE_REPO}"
BRANCH="${GITEE_BRANCH:-master}"
TOKEN="${GITEE_TOKEN:?需要环境变量 GITEE_TOKEN}"

# Gitee 免费版单文件附件大小上限（MB）。超过的文件跳过不传，避免上传卡死/被拒；
# 这些大文件继续走 GitHub/gh-proxy 兜底。
MAX_ASSET_MB="${MAX_ASSET_MB:-100}"

# 不镜像到 Gitee 的文件名模式（空格分隔的 glob），匹配到的直接跳过、连试都不试：
#   - *fixed_webview2*  fixed-webview2 安装包（200MB+，超 Gitee 上限）
#   - *armhf* / *armhfp* 冷门的 32 位 ARM 架构（受众极少，不占 Gitee 空间）
# 被排除的安装包继续保留在 GitHub，用户仍可从 GitHub 下载。
EXCLUDE_GLOBS="${EXCLUDE_GLOBS:-*fixed_webview2* *armhf* *armhfp*}"

# 文件名是否命中排除模式
is_excluded() {
  local g
  for g in ${EXCLUDE_GLOBS}; do
    case "$1" in $g) return 0 ;; esac
  done
  return 1
}
# 被跳过的文件名（每行一个），用于后续判断清单是否可发布
SKIPPED_FILE="$(mktemp)"

# 自动更新清单所在的固定 release tag（与 GitHub 端一致）
UPDATER_TAG="updater"
GH_DL_PREFIX="https://github.com/${SOURCE_REPO}/releases/download/"
GITEE_DL_PREFIX="https://gitee.com/${OWNER}/${REPO}/releases/download/"

echo "==> 源:   github.com/${SOURCE_REPO} @ ${TAG}"
echo "==> 目标: gitee.com/${OWNER}/${REPO}（分支 ${BRANCH}）"

# ---------- Gitee API 小工具 ----------

# 按 tag 查 release id（不存在则输出空）
gitee_release_id() {
  curl -fsS "${API}/repos/${OWNER}/${REPO}/releases/tags/$1?access_token=${TOKEN}" 2>/dev/null \
    | jq -r 'if type=="object" then (.id // empty) else empty end'
}

# 确保某 tag 的 release 存在，输出其 id。参数：tag name body prerelease
gitee_ensure_release() {
  local tag="$1" name="$2" body="$3" pre="$4" rid
  rid="$(gitee_release_id "$tag")"
  if [ -z "$rid" ]; then
    echo "  在 Gitee 创建 release：$tag" >&2
    rid="$(curl -fsS -X POST "${API}/repos/${OWNER}/${REPO}/releases" \
      --form-string "access_token=${TOKEN}" \
      --form-string "tag_name=${tag}" \
      --form-string "name=${name}" \
      --form-string "body=${body}" \
      --form-string "prerelease=${pre}" \
      --form-string "target_commitish=${BRANCH}" | jq -r '.id // empty')"
    if [ -z "$rid" ]; then echo "  ❌ 创建 release 失败：$tag" >&2; return 1; fi
  fi
  echo "$rid"
}

# 列出某 release 的附件，输出「name<TAB>id」每行一个
gitee_list_assets() {
  curl -fsS "${API}/repos/${OWNER}/${REPO}/releases/$1/attach_files?access_token=${TOKEN}" 2>/dev/null \
    | jq -r '.[]? | "\(.name)\t\(.id)"'
}

# 删除附件。参数：release_id attach_id
gitee_delete_asset() {
  curl -fsS -X DELETE "${API}/repos/${OWNER}/${REPO}/releases/$1/attach_files/$2?access_token=${TOKEN}" \
    >/dev/null 2>&1 || true
}

# 上传附件。参数：release_id 文件路径
# 加超时+重试：连接 30s、整体最多 30min、失败重试 2 次，避免跨境上传卡死时无限挂起。
gitee_upload_asset() {
  curl -fsS --connect-timeout 30 --max-time 1800 --retry 2 --retry-delay 5 \
    -X POST "${API}/repos/${OWNER}/${REPO}/releases/$1/attach_files" \
    --form-string "access_token=${TOKEN}" -F "file=@$2"
}

# 文件字节数（兼容 Linux/macOS）
file_size() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1"
}

# ---------- 1. 镜像版本安装包 ----------

rm -rf assets && mkdir -p assets
gh release download "${TAG}" -R "${SOURCE_REPO}" -D assets --clobber
echo "下载完成："
ls -lh assets

NAME="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json name -q '.name' || true)"
BODY="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json body -q '.body' || true)"
PRE="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json isPrerelease -q '.isPrerelease' || echo false)"
if [ -z "${NAME}" ] || [ "${NAME}" = "null" ]; then NAME="${TAG}"; fi
if [ -z "${BODY}" ] || [ "${BODY}" = "null" ]; then BODY="Mirror of ${TAG} from github.com/${SOURCE_REPO}"; fi
if [ -z "${PRE}" ] || [ "${PRE}" = "null" ]; then PRE="false"; fi

rid="$(gitee_ensure_release "${TAG}" "${NAME}" "${BODY}" "${PRE}")"
attached="$(gitee_list_assets "${rid}" | cut -f1)"

fail=0
# 阶段 1：过滤出真正要上传的文件（排除/超限/已存在的先剔掉）
UPLOAD_LIST="$(mktemp)"
for f in assets/*; do
  [ -f "${f}" ] || continue
  fn="$(basename "${f}")"
  if is_excluded "${fn}"; then
    echo "  ⏭ 跳过（已排除）：${fn}"
    echo "${fn}" >> "${SKIPPED_FILE}"
    continue
  fi
  mb=$(( $(file_size "${f}") / 1048576 ))
  if [ "${mb}" -gt "${MAX_ASSET_MB}" ]; then
    echo "  ⏭ 跳过（${mb}MB > ${MAX_ASSET_MB}MB 上限）：${fn}"
    echo "${fn}" >> "${SKIPPED_FILE}"
    continue
  fi
  if printf '%s\n' "${attached}" | grep -Fxq "${fn}"; then
    echo "  跳过（已存在）：${fn}"
    continue
  fi
  echo "${f}" >> "${UPLOAD_LIST}"
done

# 阶段 2：并发上传（跨境单连接被限速，并发可成倍提速）。PARALLEL 可调，默认 6。
PARALLEL="${PARALLEL:-6}"
FAILED_DIR="$(mktemp -d)"
export API OWNER REPO TOKEN FAILED_DIR
export GITEE_RELEASE_ID="${rid}"

# 单文件上传（供 xargs 并发调用）；失败时在 FAILED_DIR 留个标记。
# 用 curl -w 输出上传速率：传完打印「大小 @ 速率 / 耗时」。
upload_one() {
  local f="$1" fn; fn="$(basename "${f}")"
  local mb=$(( $(stat -c%s "${f}" 2>/dev/null || stat -f%z "${f}") / 1048576 ))
  echo "  ⬆ 开始（${mb}MB）：${fn}"
  local resp metrics rc
  resp="$(mktemp)"
  # body 写到文件，stdout 只留 -w 的指标：上传字节 速率(B/s) 总耗时(s) HTTP码
  metrics="$(curl -sS --connect-timeout 30 --max-time 1800 --retry 2 --retry-delay 5 \
        -o "${resp}" \
        -w '%{size_upload} %{speed_upload} %{time_total} %{http_code}' \
        -X POST "${API}/repos/${OWNER}/${REPO}/releases/${GITEE_RELEASE_ID}/attach_files" \
        --form-string "access_token=${TOKEN}" -F "file=@${f}")"
  rc=$?
  local up_bytes spd_bps secs code
  read -r up_bytes spd_bps secs code <<< "${metrics}"
  # 人类可读速率（MB/s 或 KB/s）
  local rate
  rate="$(awk -v s="${spd_bps:-0}" 'BEGIN{ if (s>=1048576) printf "%.1fMB/s", s/1048576; else printf "%.0fKB/s", s/1024 }')"
  if [ "${rc}" -eq 0 ] && jq -e '.browser_download_url // .name // .id' < "${resp}" >/dev/null 2>&1; then
    echo "  ✓ ${fn}  ${mb}MB @ ${rate}  用时${secs%.*}s"
  else
    echo "  ⚠️ 失败：${fn}（HTTP ${code:-?}，${rate}，用时${secs%.*}s）"
    : > "${FAILED_DIR}/${fn}"
  fi
  rm -f "${resp}"
}
export -f upload_one

if [ -s "${UPLOAD_LIST}" ]; then
  echo "  并发 ${PARALLEL} 个上传 ..."
  xargs -P "${PARALLEL}" -I {} bash -c 'upload_one "$@"' _ {} < "${UPLOAD_LIST}"
fi

# 收集失败：计入 fail，并记入跳过名单（供清单判断）
if [ -n "$(ls -A "${FAILED_DIR}" 2>/dev/null)" ]; then
  for ff in "${FAILED_DIR}"/*; do basename "${ff}" >> "${SKIPPED_FILE}"; done
  fail=1
fi
rm -rf "${FAILED_DIR}" "${UPLOAD_LIST}"
echo "==> 安装包镜像完成：https://gitee.com/${OWNER}/${REPO}/releases/tag/${TAG}"

# ---------- 2. 同步自动更新清单到 Gitee ----------
# 取 GitHub 的 update.json / update-fixed-webview2.json，把里面的安装包地址
# 从 github.com/<源仓库>/releases/download/ 改写成 gitee.com/<目标仓库>/releases/download/，
# 再传到 Gitee 的固定 "updater" release。仅当本次镜像的 tag 正好是清单所指版本时才刷新，
# 确保 Gitee 上对应版本的安装包已就位，避免 App 拿到指向不存在文件的清单。

rm -rf updater-src updater-out && mkdir -p updater-src updater-out
gh release download "${UPDATER_TAG}" -R "${SOURCE_REPO}" -D updater-src --clobber \
  --pattern 'update.json' --pattern 'update-fixed-webview2.json' || true

manifest_ver=""
if [ -f updater-src/update.json ]; then
  manifest_ver="$(jq -r '.name // empty' updater-src/update.json || true)"
fi

if [ -z "${manifest_ver}" ]; then
  echo "==> 未找到 GitHub updater/update.json，跳过更新清单同步。"
elif [ "${manifest_ver}" != "${TAG}" ]; then
  echo "==> 更新清单指向 ${manifest_ver}，与本次镜像的 ${TAG} 不一致，跳过清单同步（避免指向未镜像的版本）。"
else
  echo "==> 同步更新清单（版本 ${manifest_ver}）到 Gitee ${UPDATER_TAG} release ..."
  urid="$(gitee_ensure_release "${UPDATER_TAG}" "Auto-update Channel" \
    "App 自动更新清单（安装包地址指向 Gitee 国内镜像）。" "false")"

  # 现有附件名→id，用于覆盖前删除
  upd_assets="$(gitee_list_assets "${urid}")"

  for mf in update.json update-fixed-webview2.json; do
    [ -f "updater-src/${mf}" ] || { echo "  （源无 ${mf}，跳过）"; continue; }

    # 若该清单引用的某个安装包被跳过（超限/失败）未能上 Gitee，则不发布此清单，
    # 否则 App 会拿到指向 Gitee 上不存在文件的地址。这类清单交给 GitHub/gh-proxy 端点兜底。
    refs="$(jq -r '.platforms[]?.url // empty' "updater-src/${mf}" | sed 's#.*/##' | sort -u)"
    missing=""
    while IFS= read -r rf; do
      [ -n "${rf}" ] || continue
      if grep -Fxq "${rf}" "${SKIPPED_FILE}" 2>/dev/null; then missing="${missing} ${rf}"; fi
    done <<< "${refs}"
    if [ -n "${missing}" ]; then
      echo "  ⏭ 跳过清单 ${mf}：以下安装包未能上 Gitee（走 GitHub 兜底）：${missing}"
      continue
    fi

    # 改写安装包地址 github → gitee（# 作分隔符，避免 URL 里的 /）
    sed "s#${GH_DL_PREFIX}#${GITEE_DL_PREFIX}#g" "updater-src/${mf}" > "updater-out/${mf}"

    # 删除 Gitee 上的旧同名清单
    old_id="$(printf '%s\n' "${upd_assets}" | awk -F'\t' -v n="${mf}" '$1==n{print $2}')"
    if [ -n "${old_id}" ]; then gitee_delete_asset "${urid}" "${old_id}"; fi

    echo "  上传清单：${mf}"
    up="$(gitee_upload_asset "${urid}" "updater-out/${mf}" || echo '')"
    if echo "${up}" | jq -e '.browser_download_url // .name // .id' >/dev/null 2>&1; then
      echo "    ✓ https://gitee.com/${OWNER}/${REPO}/releases/download/${UPDATER_TAG}/${mf}"
    else
      echo "    ⚠️ 清单上传失败：${up}" >&2
      fail=1
    fi
  done
fi

rm -f "${SKIPPED_FILE}"
echo "==> 完成。"
exit "${fail}"
