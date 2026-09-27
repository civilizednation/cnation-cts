#!/usr/bin/env python3
"""본문에 실제로 쓰이는 글자만 남긴 서브셋 폰트를 fonts/ 폴더에 생성합니다.

사용법:
    pip install fonttools brotli
    python scripts/build-fonts.py

data/ 의 본문 전체와 앱 UI 문자열을 훑어 필요한 글자를 모으고, 여기에
KS X 1001 상용 한글 2350자를 안전망으로 더한 뒤 구글 폰트에서 원본을
내려받아 서브셋 woff2 8개를 만듭니다. 새 작품을 추가한 뒤 다시 실행하면
새로 등장한 글자가 자동으로 반영됩니다.
"""

import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    from fontTools.merge import Merger
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools가 필요합니다:  pip install fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "fonts"

USER_AGENT = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# 앱에서 고르는 글꼴 4종 × 일반/굵게
FAMILIES = [
    ("Noto Serif KR", "noto-serif-kr"),
    ("Noto Sans KR", "noto-sans-kr"),
    ("Gowun Batang", "gowun-batang"),
    ("Nanum Myeongjo", "nanum-myeongjo"),
]
WEIGHTS = [400, 700]

# 본문 외에 UI 문자열도 포함해야 하는 파일들
UI_SOURCES = ["index.html", "app.js", "styles.css", "manifest.webmanifest", "README.md"]


def collect_codepoints():
    chars = set()

    for path in sorted((ROOT / "data").rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as error:
            print(f"  건너뜀 {path.relative_to(ROOT)}: {error}")
            continue
        chars.update(json.dumps(data, ensure_ascii=False))

    for name in UI_SOURCES:
        path = ROOT / name
        if path.exists():
            chars.update(path.read_text(encoding="utf-8"))

    codepoints = {ord(c) for c in chars if ord(c) > 0x1F}

    # 기본 라틴·숫자·문장부호는 항상 포함
    codepoints.update(range(0x20, 0x7F))

    # 안전망: KS X 1001 상용 한글 2350자 — 아직 본문에 없던 글자가
    # 새 권에서 등장해도 시스템 폰트로 떨어지지 않게 합니다.
    safety = 0
    for cp in range(0xAC00, 0xD7A4):
        try:
            # iso2022_kr 은 KS X 1001 2350자만 인코딩합니다.
            # (euc_kr / cp949 는 확장 11172자를 모두 받아들여 안전망으로 쓸 수 없습니다.)
            chr(cp).encode("iso2022_kr")
        except UnicodeEncodeError:
            continue
        if cp not in codepoints:
            safety += 1
        codepoints.add(cp)

    print(f"  본문·UI 고유 글자 {len(chars):,}자 → 서브셋 대상 {len(codepoints):,}자 "
          f"(KS X 1001 안전망으로 {safety:,}자 추가)")
    return codepoints


def fetch_css(family, weight):
    url = (
        "https://fonts.googleapis.com/css2?family="
        f"{family.replace(' ', '+')}:wght@{weight}&display=swap"
    )
    request = urllib.request.Request(url, headers=USER_AGENT)
    return urllib.request.urlopen(request, timeout=60).read().decode("utf-8")


def download(url, path):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers=USER_AGENT)
            path.write_bytes(urllib.request.urlopen(request, timeout=90).read())
            return path
        except OSError:
            if attempt == 2:
                raise
    return None


def subset_slice(source, target, codepoints):
    font = TTFont(source)
    wanted = set(font.getBestCmap()) & codepoints
    if not wanted:
        return None
    options = Options()
    options.layout_features = ["*"]
    options.notdef_outline = False
    options.drop_tables += ["DSIG"]
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=wanted)
    subsetter.subset(font)
    font.save(target)
    return target


def stamp_names(font, family, weight):
    """병합된 폰트가 물려받은 엉뚱한 이름표를 바로잡습니다.

    구글이 내려주는 슬라이스는 가변 폰트의 기본 인스턴스 이름(예: "Thin")을
    달고 있어서, 그대로 합치면 400 굵기 파일이 "ExtraLight"로 보입니다.
    굵기 자체(OS/2 usWeightClass, 외곽선)는 정상이고 이름만 문제입니다.
    """
    style = "Bold" if weight >= 700 else "Regular"
    postscript = f"{family.replace(' ', '')}-{style}"
    values = {1: family, 2: style, 4: f"{family} {style}", 6: postscript}

    table = font["name"]
    table.names = [n for n in table.names if n.nameID not in (16, 17, 21, 22)]
    for name_id, value in values.items():
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)

    font["OS/2"].usWeightClass = weight
    font["head"].macStyle = 1 if style == "Bold" else 0
    return font


def build(family, slug, weight, codepoints, workdir):
    css = fetch_css(family, weight)
    urls = re.findall(r"src: url\((\S+?)\) format", css)
    if not urls:
        raise RuntimeError(f"{family} {weight}: 구글 폰트 응답에서 폰트 URL을 찾지 못했습니다")

    stage = workdir / f"{slug}-{weight}"
    stage.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(16) as pool:
        downloaded = list(pool.map(
            lambda item: download(item[1], stage / f"s{item[0]:03d}.woff2"),
            enumerate(urls),
        ))

    pieces = []
    for woff2 in downloaded:
        raw = TTFont(woff2)
        raw.flavor = None
        ttf = woff2.with_suffix(".ttf")
        raw.save(ttf)
        piece = subset_slice(ttf, stage / f"sub-{ttf.name}", codepoints)
        if piece:
            pieces.append(str(piece))

    merged = stamp_names(Merger().merge(pieces), family, weight)
    merged.flavor = "woff2"
    target = OUT_DIR / f"{slug}-{weight}.woff2"
    merged.save(target)
    return target, len(urls), len(pieces)


def main():
    print("1. 필요한 글자 수집")
    codepoints = collect_codepoints()

    OUT_DIR.mkdir(exist_ok=True)
    print("2. 서브셋 생성")
    total = 0
    with TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for family, slug in FAMILIES:
            for weight in WEIGHTS:
                target, slices, used = build(family, slug, weight, codepoints, workdir)
                size = target.stat().st_size
                total += size
                print(f"  {target.name:<26} {size / 1024:6.0f} KB  (원본 슬라이스 {used}/{slices}개)")

    print(f"\n완료 — fonts/ 8개 파일 합계 {total / 1024:.0f} KB ({total / 1048576:.2f} MB)")


if __name__ == "__main__":
    main()
