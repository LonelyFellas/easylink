#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载指定 GitHub Release tag 下的所有资源文件（assets），
单文件使用 HTTP Range 分片并发下载，最后打包成 zip。

纯标准库，无需安装任何依赖。

用法:
    python3 scripts/download_release.py [TAG]
    python3 scripts/download_release.py v1.1.5
    python3 scripts/download_release.py v1.1.5 --out /some/dir --conns 16

私有仓库 / 限流时设置令牌:
    export GITHUB_TOKEN=ghp_xxx
"""
import argparse
import os
import sys
import shutil
import zipfile
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO = "LonelyFellas/easylink"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)


def auth_headers():
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "el-downloader"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def http_get(url, headers=None, range_header=None):
    h = dict(headers or {})
    if range_header:
        h["Range"] = range_header
    req = urllib.request.Request(url, headers=h)
    return urllib.request.urlopen(req, timeout=60)


def fetch_release(tag):
    url = f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"
    try:
        with http_get(url, auth_headers()) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"❌ 获取 release 失败 (HTTP {e.code})，请确认 tag {tag} 是否存在。")


def get_size_and_ranges(url, conns):
    """返回 (总大小, 是否支持分片)。用 HEAD 探测 Content-Length 和 Accept-Ranges。"""
    req = urllib.request.Request(url, headers={"User-Agent": "el-downloader"}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            size = int(resp.headers.get("Content-Length", 0))
            accept = resp.headers.get("Accept-Ranges", "")
            # 跟随重定向后的最终响应
            supports = accept.lower() == "bytes" and size > 0
            return size, supports
    except Exception:
        return 0, False


def download_part(url, start, end, dest_part):
    """下载 [start, end] 字节段到 dest_part。断点续传：已存在则跳过已下部分。"""
    headers = {"User-Agent": "el-downloader"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    existing = os.path.getsize(dest_part) if os.path.exists(dest_part) else 0
    cur = start + existing
    if cur > end:
        return  # 该段已完成
    headers["Range"] = f"bytes={cur}-{end}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest_part, "ab") as f:
        shutil.copyfileobj(resp, f, length=1024 * 256)


def download_single(url, dest):
    """不支持分片时的整文件下载。"""
    headers = {"User-Agent": "el-downloader"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
        shutil.copyfileobj(resp, f, length=1024 * 256)


def download_asset(name, url, out_dir, conns):
    dest = os.path.join(out_dir, name)
    if os.path.exists(dest):
        print(f"    ✓ 已存在，跳过")
        return

    size, supports = get_size_and_ranges(url, conns)

    if not supports or size < 1024 * 1024:  # 小于 1M 或不支持 Range，直接整下
        download_single(url, dest)
        return

    # 切分片
    chunk = size // conns
    ranges = []
    for i in range(conns):
        start = i * chunk
        end = size - 1 if i == conns - 1 else (start + chunk - 1)
        ranges.append((i, start, end))

    part_files = [f"{dest}.part{i}" for i, _, _ in ranges]

    with ThreadPoolExecutor(max_workers=conns) as ex:
        futs = {
            ex.submit(download_part, url, s, e, f"{dest}.part{i}"): i
            for (i, s, e) in ranges
        }
        for fut in as_completed(futs):
            fut.result()  # 抛出异常则中断该文件

    # 合并分片
    with open(dest, "wb") as out:
        for pf in part_files:
            with open(pf, "rb") as p:
                shutil.copyfileobj(p, out)
            os.remove(pf)

    # 校验大小
    if os.path.getsize(dest) != size:
        raise IOError(f"大小不符: 期望 {size}, 实际 {os.path.getsize(dest)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tag", nargs="?", default="v1.1.5", help="release tag，默认 v1.1.5")
    ap.add_argument("--out", default=None, help="输出目录，默认 <项目根>/target/<TAG>")
    ap.add_argument("--conns", type=int, default=16, help="单文件分片连接数，默认 16")
    args = ap.parse_args()

    tag = args.tag
    out_dir = args.out or os.path.join(ROOT_DIR, "target", tag)
    os.makedirs(out_dir, exist_ok=True)

    print(f"==> 仓库:  {REPO}")
    print(f"==> Tag:   {tag}")
    print(f"==> 输出:  {out_dir}")
    print(f"==> 分片:  每文件 {args.conns} 连接")
    print("==> 查询 release 信息...")

    meta = fetch_release(tag)
    assets = meta.get("assets", [])
    if not assets:
        print("⚠️  该 release 没有任何 assets。")
        return

    print(f"==> 共 {len(assets)} 个文件，开始下载...")
    failed = []
    for idx, a in enumerate(assets, 1):
        name = a["name"]
        url = a["browser_download_url"]
        print(f"[{idx}/{len(assets)}] {name}")
        try:
            download_asset(name, url, out_dir, args.conns)
        except Exception as e:
            print(f"    ⚠️  下载失败: {name} ({e})", file=sys.stderr)
            failed.append(name)

    print(f"==> 下载完成，文件已保存到: {out_dir}")

    # 打包 zip 到 <项目根>/target/zips/<TAG>.zip
    zip_dir = os.path.join(ROOT_DIR, "target", "zips")
    os.makedirs(zip_dir, exist_ok=True)
    zip_path = os.path.join(zip_dir, f"{tag}.zip")
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print(f"==> 打包: {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fn in sorted(os.listdir(out_dir)):
            fp = os.path.join(out_dir, fn)
            if os.path.isfile(fp):
                zf.write(fp, arcname=fn)

    print(f"==> 打包完成: {zip_path}")
    if failed:
        print(f"⚠️  以下文件下载失败: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
