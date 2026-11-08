#!/usr/bin/env python3
"""INK-PROT-007: 准备宿主 bundle 的 entry.html 副本。

- 复制源 HTML 到 bundle 副本；
- 可选注入离线 CSP meta（仅插入标签，不改动任何现有字节，
  包括内联 <script> 的 JS 字节）；
- 输出 JSON：原文件 SHA、副本 SHA、注入前后 <script> 字节串的
  SHA 证据、注入内容。

用法: prepare_entry.py <source.html> <dest.html> <inject_csp:0|1>
"""
import hashlib
import json
import re
import sys

CSP_META = (
    '<meta http-equiv="Content-Security-Policy" '
    "content=\"default-src 'none'; script-src 'unsafe-inline'; "
    "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; "
    "connect-src 'none'\">"
)

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def script_bytes(html: bytes) -> bytes:
    """拼接所有 <script> 标签内部字节（JS 字节一致性证据）。"""
    out = []
    for m in re.finditer(rb"<script\b[^>]*>(.*?)</script>", html, re.S | re.I):
        out.append(m.group(1))
    return b"".join(out)

def main() -> None:
    src, dst, inject = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
    original = open(src, "rb").read()
    if inject and b"http-equiv=\"Content-Security-Policy\"" not in original:
        marker = b'<meta charset="utf-8">'
        assert marker in original, "charset meta not found; insertion point missing"
        patched = original.replace(marker, marker + CSP_META.encode("ascii"), 1)
    else:
        patched = original
    open(dst, "wb").write(patched)
    print(json.dumps({
        "source": src,
        "dest": dst,
        "csp_injected": inject,
        "csp_meta": CSP_META if inject else None,
        "source_sha256": sha(original),
        "bundled_sha256": sha(patched),
        "source_script_sha256": sha(script_bytes(original)),
        "bundled_script_sha256": sha(script_bytes(patched)),
        "script_bytes_identical": script_bytes(original) == script_bytes(patched),
    }, indent=2))

if __name__ == "__main__":
    main()
