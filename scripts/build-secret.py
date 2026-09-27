#!/usr/bin/env python3
"""히가시노 게이고 『비밀』 원문 TXT 두 개를 앱이 읽는 JSON으로 바꿉니다.

사용법:
    python scripts/build-secret.py <1권.txt> <2권.txt>

원문은 CP949로 저장된 고정폭 텍스트라, 문장 중간에서 줄이 끊겨 있습니다.
들여쓰기를 기준으로 문단을 되살리고 끊긴 줄을 이어 붙입니다.
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "books" / "secret"

BOOK = {
    "id": "secret",
    "title": "비밀",
    "author": "히가시노 게이고",
    "label": "히가시노 게이고 장편소설",
    "mark": "秘",
}

# 원문에서 확인한 장 제목. 검출 결과가 이와 다르면 원문이 바뀐 것이므로 멈춥니다.
EXPECTED = [
    ["믿을 수 없는 현실", "아내인가 딸인가", "두 사람만의 비밀", "풀리지 않는 의문",
     "어색한 부부", "미래를 위한 선택", "흔들리는 마음", "육체의 장벽"],
    ["회중시계", "남녀공학", "질투", "크리스마스 이브의 약속", "사랑의 방법",
     "돌아온 모나미", "얻는 것과 잃는 것", "이별의식", "비밀속으로"],
]


# 원문 오탈자. 폰트 문제가 아니라 스캔 과정에서 생긴 글자입니다.
TYPOS = {"뼌": "뻔", "잫": "잖"}


def clean(text):
    """한자 병기를 덜어내고 원문 오탈자를 고칩니다.

    본문에 한자는 괄호 병기 다섯 군데에만 나옵니다. 앞의 한글이 그대로
    남으므로 괄호째 덜어내도 뜻이 상하지 않고, 내장 서브셋 글꼴만으로
    본문 전체를 표시할 수 있게 됩니다.
    """
    text = re.sub(r"\(([^)]*[\u4e00-\u9fff][^)]*)\)", "", text)
    for wrong, right in TYPOS.items():
        text = text.replace(wrong, right)
    return text


def is_heading(line, previous):
    """빈 줄 뒤에 오는 짧은 들여쓴 줄을 장 제목으로 봅니다."""
    text = line.strip()
    if not text or len(text) > 25:
        return False
    if len(line) - len(line.lstrip()) < 2:
        return False
    if previous.strip():
        return False
    return not text.endswith((".", "!", "?", '"', "'", "”", "’"))


def split_chapters(lines, titles):
    chapters, current, title = [], [], None
    previous = ""
    for line in lines:
        if is_heading(line, previous) and line.strip() in titles:
            if title is not None:
                chapters.append((title, current))
            title, current = line.strip(), []
        elif title is not None:
            current.append(line)
        previous = line
    if title is not None:
        chapters.append((title, current))
    return chapters


def build_paragraphs(lines):
    """들여쓴 줄에서 문단을 시작하고, 왼쪽에 붙은 줄은 앞 문단에 이어 붙입니다."""
    paragraphs, buffer, joiner = [], "", ""

    def flush():
        nonlocal buffer
        if buffer.strip():
            text = re.sub(r"\s{2,}", " ", buffer).strip()
            # 문장이 줄 끝에 딱 맞아 떨어져 공백까지 사라진 자리를 되살립니다.
            text = re.sub(r"(?<=[가-힣])([.!?])(?=[가-힣])", r"\1 ", text)
            paragraphs.append(text)
        buffer = ""

    for line in lines:
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if indent >= 2:
            flush()
            buffer = line.strip()
        else:
            # 고정폭에서 잘린 줄을 이어 붙입니다. 끊긴 자리가 낱말 중간이면
            # (텔레/비전) 그냥 붙이고, 띄어쓰기 자리였으면 원문이 줄 끝에
            # 공백을 남겨두므로 그 공백을 되살립니다 (평온한/하루가).
            buffer = buffer + joiner + line.strip()
        joiner = " " if line != line.rstrip() else ""
    flush()
    return paragraphs


def split_dialogue(paragraphs):
    """큰따옴표 대사를 독립 문단으로 떼어냅니다.

    1권은 원문부터 대사가 한 문단씩인데 2권은 본문에 섞여 있어서, 같은 책
    안에서 화면이 달라 보입니다. 두 권을 1권 쪽 형식으로 맞춥니다.
    """
    result = []
    for paragraph in paragraphs:
        if paragraph.count('"') < 2:
            result.append(paragraph)
            continue
        for piece in re.split(r'("[^"]*")', paragraph):
            piece = piece.strip()
            if piece:
                result.append(piece)
    return result


def convert(path, volume, titles):
    lines = path.read_bytes().decode("cp949").splitlines()
    chapters = split_chapters(lines, set(titles))
    found = [title for title, _ in chapters]
    if found != titles:
        sys.exit(f"{path.name}: 장 제목이 예상과 다릅니다\n  검출: {found}\n  예상: {titles}")

    built = []
    for index, (title, body) in enumerate(chapters, start=1):
        paragraphs = split_dialogue(build_paragraphs(body))
        built.append({
            "number": index,
            "title": f"{index}장 {title}",
            "content": clean("\n\n".join(paragraphs)),
        })
    return built


def main():
    if len(sys.argv) != 3:
        sys.exit("사용법: python scripts/build-secret.py <1권.txt> <2권.txt>")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "volumes").mkdir(exist_ok=True)

    volumes, offset = [], 0
    for index, (source, titles) in enumerate(zip(sys.argv[1:], EXPECTED), start=1):
        chapters = convert(Path(source), index, titles)
        for position, chapter in enumerate(chapters, start=1):
            chapter["number"] = offset + position
            chapter["title"] = f"{offset + position}장 " + chapter["title"].split("장 ", 1)[1]

        name = f"volume-{index:02d}.json"
        payload = {
            "volume": index,
            "title": f"{index}권",
            "startEpisode": offset + 1,
            "endEpisode": offset + len(chapters),
            "chapterCount": len(chapters),
            "chapters": chapters,
        }
        (OUT_DIR / "volumes" / name).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        volumes.append({
            "volume": index,
            "title": f"{index}권",
            "startEpisode": offset + 1,
            "endEpisode": offset + len(chapters),
            "chapterCount": len(chapters),
            "path": f"./data/books/secret/volumes/{name}",
        })
        offset += len(chapters)
        letters = sum(len(c["content"]) for c in chapters)
        print(f"  {index}권: {len(chapters)}장, {letters:,}자 → {name}")

    catalog = dict(BOOK)
    catalog.update({
        "totalEpisodes": offset,
        "totalVolumes": len(volumes),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "volumes": volumes,
    })
    (OUT_DIR / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"완료 — 총 {offset}장, data/books/secret/ 생성")


if __name__ == "__main__":
    main()
