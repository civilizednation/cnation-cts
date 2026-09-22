# fonts/

앱에 내장한 서브셋 폰트입니다. 원본 전체를 넣지 않고, `data/`의 본문과 앱 UI에
실제로 쓰이는 글자만 남겨 용량을 약 1/8로 줄였습니다. 8개 합계 약 1.8MB입니다.

## 파일

| 파일 | 글꼴 | 굵기 | 앱에서의 쓰임 |
| --- | --- | --- | --- |
| `noto-serif-kr-400.woff2` | 본명조 | 일반 | 본문 기본값 · 첫 화면 프리캐시 |
| `noto-serif-kr-700.woff2` | 본명조 | 굵게 | 제목 · 본문 굵게 · 첫 화면 프리캐시 |
| `noto-sans-kr-400.woff2` | 본고딕 | 일반 | UI 기본 · 첫 화면 프리캐시 |
| `noto-sans-kr-700.woff2` | 본고딕 | 굵게 | UI 강조 · 첫 화면 프리캐시 |
| `gowun-batang-400.woff2` | 고운바탕 | 일반 | 설정에서 고를 때 내려받음 |
| `gowun-batang-700.woff2` | 고운바탕 | 굵게 | 설정에서 고를 때 내려받음 |
| `nanum-myeongjo-400.woff2` | 나눔명조 | 일반 | 설정에서 고를 때 내려받음 |
| `nanum-myeongjo-700.woff2` | 나눔명조 | 굵게 | 설정에서 고를 때 내려받음 |

굵기는 400·700만 내장합니다. `styles.css`가 쓰는 `font-weight: 600`은 브라우저가
CSS 글꼴 매칭 규칙에 따라 700으로 대체하므로 별도 파일이 필요하지 않습니다.

## 다시 만들기

새 작품이나 새 권을 `data/`에 추가하면, 그전에 없던 글자가 들어올 수 있습니다.
아래를 실행하면 본문을 다시 훑어 8개 파일을 새로 만듭니다.

```bash
pip install fonttools brotli
python scripts/build-fonts.py
```

포함되는 글자는 다음 세 가지의 합집합입니다.

1. `data/` 안 모든 JSON 본문에 등장하는 글자
2. `index.html` · `app.js` · `styles.css` 등 앱 UI 문자열의 글자
3. KS X 1001 상용 한글 2350자 (안전망)

3번 덕분에 본문을 다시 만들지 않은 상태에서 새 글자가 등장해도 대부분 그대로
표시됩니다. 그래도 빠진 글자가 있으면 `font-family` 목록 끝의 시스템 글꼴로
대체되어 깨지지 않고 읽을 수 있습니다.

## 라이선스

네 글꼴 모두 SIL Open Font License 1.1이며, 서브셋(수정본) 배포가 허용됩니다.
원본 라이선스 전문을 함께 보관합니다.

| 글꼴 | 저작권 | 라이선스 전문 |
| --- | --- | --- |
| Noto Serif KR | Copyright 2012 Google Inc. | `LICENSE-noto-serif-kr.txt` |
| Noto Sans KR | Copyright 2014-2021 Adobe | `LICENSE-noto-sans-kr.txt` |
| Gowun Batang | Copyright 2021 The Gowun Batang Project Authors | `LICENSE-gowun-batang.txt` |
| Nanum Myeongjo | Copyright (c) 2010 NHN Corporation | `LICENSE-nanum-myeongjo.txt` |

Noto Sans KR과 Nanum Myeongjo에는 예약 글꼴 이름(Reserved Font Name)이 걸려
있습니다. 여기 있는 파일은 글자만 덜어낸 서브셋이라 자형은 원본 그대로이며 웹에서
표시하는 용도로만 씁니다. 글꼴 자체를 고치거나 따로 배포할 때는 라이선스 전문의
해당 조항을 먼저 확인하세요.

원본은 모두 Google Fonts에서 받았습니다. `scripts/build-fonts.py`가 받아오는
주소가 곧 출처입니다.
