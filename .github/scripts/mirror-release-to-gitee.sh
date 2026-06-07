#!/usr/bin/env bash
#
# 把指定 GitHub Release tag 的产物镜像到 Gitee Releases（国内全速下载），
# 并把自动更新清单（update.json / update-fixed-webview2.json）同步到 Gitee 的
# 固定 "updater" release，清单里的安装包地址改写成 Gitee 地址，供 App 自动更新走 Gitee。
#
# 子命令（供 GitHub Actions 多 runner 并行 matrix 调用）：
#   prepare              在 Gitee 确保版本 release 存在，输出其 id（写 GITHUB_OUTPUT 的 rid）
#   prune                只留最新 PRUNE_KEEP 个版本 release，删更旧的以腾 Gitee 1GB 配额
#   upload <rid> [glob…] 下载匹配 glob 的产物并上传到该 release；无 glob 则上传全部
#   manifest <rid>       同步自动更新清单（按 Gitee 上实际已传的附件判断是否齐全）
#   all <tag>            单机全量：prepare + prune + upload(全部) + manifest（本地手动用，兼容旧用法）
#
# 依赖：gh、curl、jq（GitHub Actions ubuntu runner 已内置；本地需自行安装并 gh auth login）
#
# 环境变量：
#   TAG            要镜像的 release tag（prepare/upload/manifest 必填；all 用第二参数）
#   SOURCE_REPO    GitHub 源仓库，默认 LonelyFellas/easylink
#   GITEE_OWNER/GITEE_REPO/GITEE_BRANCH/GITEE_TOKEN   Gitee 目标与令牌
#   MAX_ASSET_MB   单文件上限（MB），超过跳过，默认 100
#   EXCLUDE_GLOBS  不镜像的文件名 glob（空格分隔）
#   PARALLEL       单个 job 内并发上传数，默认 4（matrix 靠 runner 数横向扩展，单 job 别堆太高以免撞 Gitee 限流）
#
# 用法示例：
#   TAG=v1.1.9 bash mirror-release-to-gitee.sh prepare
#   TAG=v1.1.9 bash mirror-release-to-gitee.sh upload 12345 '*_amd64.deb*' '*x86_64.rpm*'
#   TAG=v1.1.9 bash mirror-release-to-gitee.sh manifest 12345
#   bash mirror-release-to-gitee.sh all v1.1.9
#
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:-LonelyFellas/easylink}"
API="https://gitee.com/api/v5"
OWNER="${GITEE_OWNER:?需要环境变量 GITEE_OWNER}"
REPO="${GITEE_REPO:?需要环境变量 GITEE_REPO}"
BRANCH="${GITEE_BRANCH:-master}"
TOKEN="${GITEE_TOKEN:?需要环境变量 GITEE_TOKEN}"

# Gitee 免费版单文件附件大小上限（MB）。超过的文件跳过不传，继续走 GitHub/gh-proxy 兜底。
MAX_ASSET_MB="${MAX_ASSET_MB:-100}"

# 不镜像到 Gitee 的文件名模式（空格分隔的 glob）：
#   - *fixed_webview2*  fixed-webview2 安装包（200MB+，超 Gitee 上限）
#   - *armhf* / *armhfp* 冷门的 32 位 ARM 架构
EXCLUDE_GLOBS="${EXCLUDE_GLOBS:-*fixed_webview2* *armhf* *armhfp*}"

# 单 job 内并发上传数。matrix 已按平台×架构把文件拆到多个 runner 并行，
# 每个 job 只有 1~3 个文件，这里不必（也不应）开太高，避免多 job 共用一个 token 撞 Gitee 限流。
PARALLEL="${PARALLEL:-4}"

UPDATER_TAG="updater"
GH_DL_PREFIX="https://github.com/${SOURCE_REPO}/releases/download/"
GITEE_DL_PREFIX="https://gitee.com/${OWNER}/${REPO}/releases/download/"

# ---------- 通用小工具 ----------

# 文件名是否命中排除模式
is_excluded() {
  local g
  for g in ${EXCLUDE_GLOBS}; do
    case "$1" in $g) return 0 ;; esac
  done
  return 1
}

# 文件字节数（兼容 Linux/macOS）
file_size() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1"
}

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

# 列出仓库所有 release，输出「tag_name<TAB>id」每行一个（按时间倒序，取前 100 个）
gitee_list_releases() {
  curl -fsS "${API}/repos/${OWNER}/${REPO}/releases?access_token=${TOKEN}&page=1&per_page=100&direction=desc" 2>/dev/null \
    | jq -r '.[]? | "\(.tag_name)\t\(.id)"'
}

# 删除整个 release（连带其全部附件，释放仓库配额）。参数：release_id
gitee_delete_release() {
  curl -fsS -X DELETE "${API}/repos/${OWNER}/${REPO}/releases/$1?access_token=${TOKEN}" >/dev/null 2>&1
}

# 上传附件。参数：release_id 文件路径
gitee_upload_asset() {
  curl -fsS --connect-timeout 30 --max-time 1800 --retry 2 --retry-delay 5 \
    -X POST "${API}/repos/${OWNER}/${REPO}/releases/$1/attach_files" \
    --form-string "access_token=${TOKEN}" -F "file=@$2"
}

# 单文件上传（供 xargs 并发调用）；失败时在 FAILED_DIR 留个标记。
# 用 curl -w 输出上传速率：传完打印「大小 @ 速率 / 耗时」。
upload_one() {
  local f="$1" fn; fn="$(basename "${f}")"
  local mb=$(( $(stat -c%s "${f}" 2>/dev/null || stat -f%z "${f}") / 1048576 ))
  echo "  ⬆ 开始（${mb}MB）：${fn}"
  local resp metrics rc
  resp="$(mktemp)"
  metrics="$(curl -sS --connect-timeout 30 --max-time 1800 --retry 2 --retry-delay 5 \
        -o "${resp}" \
        -w '%{size_upload} %{speed_upload} %{time_total} %{http_code}' \
        -X POST "${API}/repos/${OWNER}/${REPO}/releases/${GITEE_RELEASE_ID}/attach_files" \
        --form-string "access_token=${TOKEN}" -F "file=@${f}")"
  rc=$?
  local up_bytes spd_bps secs code
  read -r up_bytes spd_bps secs code <<< "${metrics}"
  local rate
  rate="$(awk -v s="${spd_bps:-0}" 'BEGIN{ if (s>=1048576) printf "%.1fMB/s", s/1048576; else printf "%.0fKB/s", s/1024 }')"
  if [ "${rc}" -eq 0 ] && jq -e '.browser_download_url // .name // .id' < "${resp}" >/dev/null 2>&1; then
    echo "  ✓ ${fn}  ${mb}MB @ ${rate}  用时${secs%.*}s"
  else
    echo "  ⚠️ 失败：${fn}（HTTP ${code:-?}，${rate}，用时${secs%.*}s）"
    # 打印 Gitee 返回的响应体，定位 400 真因（大小超限/配额满/类型受限等）
    local body; body="$(jq -r '.message // (.error // empty)' < "${resp}" 2>/dev/null || true)"
    [ -z "${body}" ] && body="$(head -c 500 "${resp}" 2>/dev/null || true)"
    echo "     ↳ Gitee 响应：${body:-（空）}"
    : > "${FAILED_DIR}/${fn}"
  fi
  rm -f "${resp}"
}
export -f upload_one

# ---------- 子命令：prepare ----------
# 在 Gitee 确保版本 release 存在，输出其 id（同时写入 GITHUB_OUTPUT 的 rid）。
cmd_prepare() {
  : "${TAG:?需要环境变量 TAG}"
  echo "==> prepare：在 gitee.com/${OWNER}/${REPO} 确保 release ${TAG} 存在" >&2
  local name body pre rid
  name="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json name -q '.name' 2>/dev/null || true)"
  body="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json body -q '.body' 2>/dev/null || true)"
  pre="$(gh release view "${TAG}" -R "${SOURCE_REPO}" --json isPrerelease -q '.isPrerelease' 2>/dev/null || echo false)"
  if [ -z "${name}" ] || [ "${name}" = "null" ]; then name="${TAG}"; fi
  if [ -z "${body}" ] || [ "${body}" = "null" ]; then body="Mirror of ${TAG} from github.com/${SOURCE_REPO}"; fi
  if [ -z "${pre}" ] || [ "${pre}" = "null" ]; then pre="false"; fi

  rid="$(gitee_ensure_release "${TAG}" "${name}" "${body}" "${pre}")"
  echo "==> Gitee release id = ${rid}" >&2
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "rid=${rid}" >> "${GITHUB_OUTPUT}"
  echo "${rid}"
}

# ---------- 子命令：prune ----------
# 用法：cmd_prune
# Gitee 免费仓库所有 release 附件总量上限 1GB。镜像只为「国内全速下载 + 自动更新」，
# 自动更新只需最新版，旧版本安装包纯占配额（单版本全平台产物已接近 1GB，留 2 版必超）。
# 这里只保留最新 PRUNE_KEEP（默认 1）个版本 release，删掉更旧的（连带其附件腾配额）。
# updater 等非版本 release 永不删；当前 TAG 强制保留。
PRUNE_KEEP="${PRUNE_KEEP:-1}"
cmd_prune() {
  : "${TAG:?需要环境变量 TAG}"
  echo "==> prune：保留最新 ${PRUNE_KEEP} 个版本，清理更旧版本以腾 Gitee 1GB 配额（updater 永不删）"
  local all; all="$(gitee_list_releases)"
  if [ -z "${all}" ]; then echo "  Gitee 暂无 release，跳过。"; return 0; fi

  # 仅 vX.Y.Z 形式的版本 tag 参与清理；updater 等非版本 release 永远保留
  local versions; versions="$(printf '%s\n' "${all}" | awk -F'\t' '$1 ~ /^v[0-9]+\.[0-9]+\.[0-9]+/ {print $1}')"
  if [ -z "${versions}" ]; then echo "  无版本 release，跳过。"; return 0; fi

  # 按版本号降序取要保留的最新 N 个，并强制保留当前正在镜像的 TAG
  local keep; keep="$(printf '%s\n' "${versions}" | sort -Vr | head -n "${PRUNE_KEEP}")"
  keep="$(printf '%s\n%s\n' "${keep}" "${TAG}" | sort -u)"
  echo "  保留版本：$(printf '%s\n' "${keep}" | sort -Vr | tr '\n' ' ')"

  local tag id pruned=0
  while IFS=$'\t' read -r tag id; do
    [ -n "${tag}" ] || continue
    printf '%s\n' "${versions}" | grep -Fxq "${tag}" || continue   # 非版本 release：跳过
    printf '%s\n' "${keep}"     | grep -Fxq "${tag}" && continue   # 在保留集：跳过
    echo "  🗑 删除旧版本 release：${tag}（id=${id}）"
    if gitee_delete_release "${id}"; then echo "    ✓ 已删除"; pruned=$((pruned+1)); else echo "    ⚠️ 删除失败：${tag}"; fi
  done <<< "${all}"
  echo "==> prune 完成，清理了 ${pruned} 个旧版本。"
}

# ---------- 子命令：upload ----------
# 用法：cmd_upload <rid> [glob ...]
# 下载匹配 glob 的产物（无 glob = 全部），过滤排除/超限/已存在后并发上传到该 release。
cmd_upload() {
  : "${TAG:?需要环境变量 TAG}"
  local rid="$1"; shift || true
  [ -n "${rid}" ] || { echo "❌ upload 需要 release id" >&2; return 1; }
  local globs=("$@")

  echo "==> upload：tag=${TAG} rid=${rid} globs=[${globs[*]:-全部}]"
  rm -rf assets && mkdir -p assets
  if [ "${#globs[@]}" -eq 0 ]; then
    gh release download "${TAG}" -R "${SOURCE_REPO}" -D assets --clobber
  else
    local g
    for g in "${globs[@]}"; do
      gh release download "${TAG}" -R "${SOURCE_REPO}" -D assets --clobber --pattern "${g}" || true
    done
  fi
  if [ -z "$(ls -A assets 2>/dev/null)" ]; then
    echo "  本分片无匹配产物，跳过。"
    return 0
  fi
  echo "下载到的产物："; ls -lh assets

  # 该 release 上已有的附件名（用于跳过重复上传）
  local attached
  attached="$(gitee_list_assets "${rid}" | cut -f1)"

  # 过滤出真正要传的文件
  local UPLOAD_LIST f fn mb
  UPLOAD_LIST="$(mktemp)"
  for f in assets/*; do
    [ -f "${f}" ] || continue
    fn="$(basename "${f}")"
    if is_excluded "${fn}"; then echo "  ⏭ 跳过（已排除）：${fn}"; continue; fi
    mb=$(( $(file_size "${f}") / 1048576 ))
    if [ "${mb}" -gt "${MAX_ASSET_MB}" ]; then
      echo "  ⏭ 跳过（${mb}MB > ${MAX_ASSET_MB}MB 上限）：${fn}"; continue
    fi
    if printf '%s\n' "${attached}" | grep -Fxq "${fn}"; then
      echo "  跳过（已存在）：${fn}"; continue
    fi
    echo "${f}" >> "${UPLOAD_LIST}"
  done

  if [ ! -s "${UPLOAD_LIST}" ]; then
    echo "  本分片无需上传（都已存在或被过滤）。"; rm -f "${UPLOAD_LIST}"; return 0
  fi

  # 大文件优先：按字节降序，最大的先进并发池，减少长尾
  local SORTED; SORTED="$(mktemp)"
  while IFS= read -r f; do
    [ -f "${f}" ] || continue
    printf '%s\t%s\n' "$(file_size "${f}")" "${f}"
  done < "${UPLOAD_LIST}" | sort -rn | cut -f2- > "${SORTED}"
  mv "${SORTED}" "${UPLOAD_LIST}"

  FAILED_DIR="$(mktemp -d)"
  export API OWNER REPO TOKEN FAILED_DIR
  export GITEE_RELEASE_ID="${rid}"

  echo "  并发 ${PARALLEL} 个上传（大文件优先）..."
  xargs -P "${PARALLEL}" -I {} bash -c 'upload_one "$@"' _ {} < "${UPLOAD_LIST}"

  local failed=0
  if [ -n "$(ls -A "${FAILED_DIR}" 2>/dev/null)" ]; then
    echo "  ⚠️ 本分片有文件上传失败：" ; ls "${FAILED_DIR}"
    failed=1
  fi
  rm -rf "${FAILED_DIR}" "${UPLOAD_LIST}"
  echo "==> 分片上传完成：https://gitee.com/${OWNER}/${REPO}/releases/tag/${TAG}"
  return "${failed}"
}

# ---------- 子命令：manifest ----------
# 用法：cmd_manifest <version_rid>
# 取 GitHub updater 清单，地址改写 github → gitee，传到 Gitee 的固定 "updater" release。
# 仅当清单版本 == 本次 TAG，且清单引用的安装包都已实际出现在 Gitee 版本 release 时才发布该清单，
# 避免 App 拿到指向不存在文件的地址。引用是否齐全用「Gitee 实际附件列表」判断（适配 matrix 并行）。
cmd_manifest() {
  : "${TAG:?需要环境变量 TAG}"
  local rid="$1"
  [ -n "${rid}" ] || { echo "❌ manifest 需要版本 release id" >&2; return 1; }

  rm -rf updater-src updater-out && mkdir -p updater-src updater-out
  gh release download "${UPDATER_TAG}" -R "${SOURCE_REPO}" -D updater-src --clobber \
    --pattern 'update.json' --pattern 'update-fixed-webview2.json' || true

  local manifest_ver=""
  [ -f updater-src/update.json ] && manifest_ver="$(jq -r '.name // empty' updater-src/update.json || true)"

  if [ -z "${manifest_ver}" ]; then
    echo "==> 未找到 GitHub updater/update.json，跳过更新清单同步。"; return 0
  fi
  if [ "${manifest_ver}" != "${TAG}" ]; then
    echo "==> 更新清单指向 ${manifest_ver}，与本次镜像的 ${TAG} 不一致，跳过清单同步。"; return 0
  fi

  echo "==> 同步更新清单（版本 ${manifest_ver}）到 Gitee ${UPDATER_TAG} release ..."
  local urid; urid="$(gitee_ensure_release "${UPDATER_TAG}" "Auto-update Channel" \
    "App 自动更新清单（安装包地址指向 Gitee 国内镜像）。" "false")"

  # Gitee 版本 release 上实际已传的附件名（判断清单引用是否齐全的依据）
  local present; present="$(gitee_list_assets "${rid}" | cut -f1)"
  # updater release 现有清单名→id（覆盖前删除）
  local upd_assets; upd_assets="$(gitee_list_assets "${urid}")"

  local fail=0 mf refs missing rf old_id up
  for mf in update.json update-fixed-webview2.json; do
    [ -f "updater-src/${mf}" ] || { echo "  （源无 ${mf}，跳过）"; continue; }

    refs="$(jq -r '.platforms[]?.url // empty' "updater-src/${mf}" | sed 's#.*/##' | sort -u)"
    missing=""
    while IFS= read -r rf; do
      [ -n "${rf}" ] || continue
      printf '%s\n' "${present}" | grep -Fxq "${rf}" || missing="${missing} ${rf}"
    done <<< "${refs}"
    if [ -n "${missing}" ]; then
      echo "  ⏭ 跳过清单 ${mf}：以下安装包未在 Gitee（走 GitHub 兜底）：${missing}"
      continue
    fi

    sed "s#${GH_DL_PREFIX}#${GITEE_DL_PREFIX}#g" "updater-src/${mf}" > "updater-out/${mf}"
    old_id="$(printf '%s\n' "${upd_assets}" | awk -F'\t' -v n="${mf}" '$1==n{print $2}')"
    [ -n "${old_id}" ] && gitee_delete_asset "${urid}" "${old_id}"

    echo "  上传清单：${mf}"
    up="$(gitee_upload_asset "${urid}" "updater-out/${mf}" || echo '')"
    if echo "${up}" | jq -e '.browser_download_url // .name // .id' >/dev/null 2>&1; then
      echo "    ✓ https://gitee.com/${OWNER}/${REPO}/releases/download/${UPDATER_TAG}/${mf}"
    else
      echo "    ⚠️ 清单上传失败：${up}" >&2; fail=1
    fi
  done
  return "${fail}"
}

# ---------- 子命令：all（本地单机全量，兼容旧用法） ----------
cmd_all() {
  export TAG="${1:?用法: mirror-release-to-gitee.sh all <tag>}"
  local rid; rid="$(cmd_prepare)"
  cmd_prune
  cmd_upload "${rid}"
  cmd_manifest "${rid}"
}

# ---------- 分派 ----------
echo "==> 源:   github.com/${SOURCE_REPO}"
echo "==> 目标: gitee.com/${OWNER}/${REPO}（分支 ${BRANCH}）"

SUB="${1:?用法: mirror-release-to-gitee.sh <prepare|prune|upload|manifest|all> ...}"
shift || true
case "${SUB}" in
  prepare)  cmd_prepare "$@" ;;
  prune)    cmd_prune "$@" ;;
  upload)   cmd_upload "$@" ;;
  manifest) cmd_manifest "$@" ;;
  all)      cmd_all "$@" ;;
  v*.*.*)   cmd_all "${SUB}" ;;   # 兼容旧用法：mirror-release-to-gitee.sh v1.1.9
  *)        echo "❌ 未知子命令：${SUB}" >&2; exit 1 ;;
esac
