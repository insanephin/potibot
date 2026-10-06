# frontend

포티봇 웹 대시보드와 확장 프로그램은 한 프로젝트에서 빌드합니다. 

두 출력물은 `src/`의 API 클라이언트·타입·UI 컴포넌트를 공유합니다.

- React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui(Base UI), React Router, axios
- Node 22-alpine

| 서비스 | 빌드 | 출력 |
| --- | --- | --- |
| 웹 대시보드 | `npm run build` | `dist/` — nginx가 그대로 서빙 |
| 확장 프로그램 | `npm run build:extension` | `dist-extension/` |

## 디렉터리 구조

```
frontend/
├── src/                 # 웹 앱
│   ├── api/             # 백엔드 API 클라이언트 (/api/*)
│   ├── components/
│   │   ├── app/         # 헤더, 푸터, 스트리머 검색, 에러 페이지
│   │   ├── home/        # 랜딩 페이지, 채널별 홈
│   │   ├── dashboard/   # 신청곡·재생 바·기기·설정·Spotify 연결
│   │   ├── legal/       # 이용약관, 개인정보처리방침
│   │   ├── shared/      # 공용 패널, 트랙 행
│   │   └── ui/          # shadcn/ui 컴포넌트
│   ├── hooks/           # 데이터·재생 상태·팝업 훅
│   ├── lib/             # 정규화 함수, 상수, 유틸
│   └── types/
├── extension/           # 확장 프로그램
│   ├── popup.html
│   └── src/
│       ├── background.ts   # 서비스 워커: OAuth(launchWebAuthFlow), API 호출
│       ├── content.ts      # open.spotify.com 대기열에 신청자 표시
│       └── popup-app.tsx   # 팝업 UI (로그인, 상태, 설정)
├── public/              # 폰트, 아이콘, 치지직·Spotify 로고
├── vite.config.ts             # 웹 빌드
└── vite.extension.config.ts   # 확장 빌드 + manifest.json 생성
```

## 웹 대시보드

### 라우트

| 경로 | 화면 |
| --- | --- |
| `/` | 랜딩 페이지 |
| `/:id` | 스트리머 채널 페이지 (재생 중인 곡, 신청곡) |
| `/dashboard` | 스트리머 대시보드 (로그인 필요) |
| `/terms`, `/privacy` | 약관 문서 |

### 개발

```bash
npm install
npm run dev
```

API 요청은 같은 출처의 `/api/*`로 나갑니다. Vite 개발 서버에는 프록시 설정이 없으므로, 로컬에서 API까지 연동하려면 nginx(루트 `docker-compose.yml`) 뒤에서 띄우거나 `vite.config.ts`에 `server.proxy`를 추가해야 합니다. 로그인은 쿠키 기반 세션을 사용합니다.

## 확장 프로그램 (개발)

Spotify 웹 플레이어(`open.spotify.com`) 대기열에 포티봇 신청곡과 신청자를 표시하고, 팝업에서 치지직·Spotify 로그인과 설정을 관리합니다. 확장은 쿠키 대신 `chrome.storage.local`에 보관한 토큰을 `Authorization: Bearer` 헤더로 보냅니다.

```bash
npm run build:extension          # dist-extension/ 생성
npm run dev:extension            # 변경 감지 빌드
```

`chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드"에서 `dist-extension/`을 선택합니다.

빌드 시 환경 변수:

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `POTIBOT_ORIGIN` | `https://potibot.insanephin.xyz` | 확장이 호출할 API 출처 (`host_permissions`에도 반영) |
| `EXTENSION_VERSION` | `0.0.1-dev` | 매니페스트 버전. 앞의 `v`는 제거되고 `-`/`+` 앞부분이 `version`이 됨 |

확장으로 로그인하려면 백엔드 `config.ini`의 `global.extension_ids`에 확장 ID를 등록해야 합니다.

`content.js`는 클래식 스크립트로 주입되므로 다른 청크를 import하면 빌드가 실패합니다.
