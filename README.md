# Cnation Book

여러 작품을 선택해 읽는 설치형 태블릿 웹 이북입니다. 현재 `닥터 최태수`와 `신경외과의사 박재현`을 제공하며, 별도 빌드 없이 Vercel에서 바로 실행됩니다.

## 1. GitHub에 올리기

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더의 내용을 저장소 최상위에 그대로 올립니다.

`index.html`이 저장소 최상위에 있어야 합니다. 폴더 자체를 한 단계 더 감싸서 올리지 마세요.

## 2. Vercel에 배포하기

1. Vercel에서 **Add New → Project**를 선택합니다.
2. 위에서 만든 GitHub 저장소를 Import합니다.
3. 기존 Vercel 프로젝트 `cnation-cts`를 선택합니다.
4. **Framework Preset**은 `Other`로 둡니다.
5. **Root Directory**는 `./` 그대로 둡니다.
6. Build Command와 Output Directory는 건드리지 않고 **Deploy**를 누릅니다.

배포가 완료되면 기존 주소 `https://cnation-cts.vercel.app`으로 접속합니다.

태블릿에서 주소를 연 뒤 **앱 설치** 또는 **홈 화면에 추가**를 선택하면 전체 화면으로 실행됩니다.

## 노트북에서 간편하게 열기

저장소 루트의 `로컬에서-열기.cmd`를 더블클릭하면 로컬 서버가 시작되고 브라우저가 자동으로 열립니다.

- 읽는 동안 검은 실행 창을 열어 둡니다.
- 종료할 때 실행 창에서 `Ctrl+C`를 누릅니다.
- Node.js가 설치되어 있어야 합니다.

## 폴더 구성

```text
index.html              앱 시작 파일
app.js                  독서·책갈피 기능
styles.css              책 화면 디자인
manifest.webmanifest    PWA 설치 정보
service-worker.js       오프라인 캐시
vercel.json             Vercel/PWA 응답 설정
icons/                  설치 아이콘
fonts/                  본문 글꼴 (서브셋 woff2 8종)
data/library.json       작품 목록
data/catalog.json       닥터 최태수 27권 목록
data/volumes/           닥터 최태수 1~27권 본문
data/books/             추가 작품의 목록과 본문
scripts/                본문·아이콘 재생성 도구
```

## 글꼴 다시 만들기

글꼴은 외부 CDN에서 받지 않고 `fonts/` 폴더에 내장합니다. 본문에 실제로 쓰이는
글자만 남긴 서브셋이라 8종 전부 합쳐 1.8MB 정도입니다.

새 작품이나 새 권을 `data/`에 추가했다면, 그전에 없던 글자가 들어올 수 있으므로
아래를 실행해 글꼴을 다시 만듭니다.

```bash
pip install fonttools brotli
python scripts/build-fonts.py
```

다시 만든 뒤에는 `service-worker.js`의 `CACHE_VERSION` 값을 한 단계 올려야
이미 설치된 기기가 새 글꼴을 내려받습니다.

자세한 내용은 `fonts/README.md`를 참고하세요.

## 앱 아이콘 바꾸기

`icons/icon-source.png`를 새 정사각형 PNG로 교체한 뒤 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-icons.ps1
```

## 참고

- 작품별 읽던 위치와 책갈피, 공통 독서 설정은 해당 기기의 브라우저에 저장됩니다.
- 한 번 열어 본 권은 오프라인에서도 다시 읽을 수 있습니다.
- 원본 TXT는 이 저장소에 포함되지 않습니다.
