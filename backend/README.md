# backend

FastAPI 서버와 치지직 연결을 위한 Socket.io로 이루어진 백엔드입니다. 

두 프로세스는 같은 코드베이스와 PostgreSQL·Redis를 공유합니다.

| 진입점 | 실행 | 설명 |
| --- | --- | --- |
| [app.py](app.py) | `python app.py` | API 서버 (uvicorn, `0.0.0.0:8000`, `root_path=/api/`) |
| [worker.py](worker.py) | `python worker.py` | 스트리머별 치지직 Socket.IO 세션 유지 |

## 디렉터리 구조

```
backend/
├── api/            # FastAPI 앱, 인증(JWT), 라우터, 스케줄 작업
│   └── routers/    # chzzk, spotify, playback, dashboard, user, public
├── chatbot/        # Socket.io (SioManager: 연결 관리, SioClient: 명령어 처리)
├── core/           # 도메인 로직 (신청곡, 대기열, 재생 상태, 설정, 통계 …)
├── providers/      # 공통 HTTP 및 외부 API 클라이언트 (chzzk, spotify)
├── database/       # SQLAlchemy 모델, async 엔진, Redis 클라이언트
├── migrations/     # Alembic 마이그레이션
├── utils/          # 로깅
├── tests/
└── config.py       # config.ini
```

### 계층 규칙

패키지 간 import 방향이 고정되어 있으며 [tests/test_layering.py](tests/test_layering.py)가 이를 검사합니다.

```
api, chatbot  →  core  →  database, providers, utils
                          database → config
```

- `api`와 `chatbot`은 서로 import하지 않습니다. 
- `providers`와 `utils`는 다른 로컬 패키지에 의존하지 않습니다.

## 로컬 개발

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt

alembic upgrade head     # 스키마 적용
python app.py            # API 서버 (별도 터미널)
python worker.py         # Socket.io (별도 터미널)
```

의존성 파일은 프로세스별로 나뉘어 있고 Docker 이미지 빌드 시 `REQUIREMENTS` 인자로 선택합니다.

| 파일 | 용도 |
| --- | --- |
| `requirements-common.txt` | 공통 패키지 |
| `requirements-api.txt` | API 서버 (FastAPI, uvicorn, PyJWT) |
| `requirements-worker.txt` | Socket.io (python-socketio 4.x, pydantic) |
| `requirements-dev.txt` | 전체 + pytest, ruff |

## 동작 개요

### API 서버

시작 시 스케줄러를 등록합니다 [api/server.py](api/server.py)

| 작업 | 주기 |
| --- | --- |
| 방송 중인 채널 목록 갱신 | 5초 |
| 현재 재생 곡 갱신 | 5초 |
| 채널 정보 캐시 | 60초 |
| 오래된 트랙 정보 정리 | 24시간 |

### Socket.io

- [chatbot/manager.py](chatbot/manager.py)가 10초마다 등록된 스트리머 목록을 확인해 채팅 세션을 연결 · 재연결 · 정리합니다.
- [chatbot/chat.py](chatbot/chat.py)가 명령어를 처리합니다. 명령어마다 사용자별 · 채널별 쿨다운이 Redis로 걸려 있습니다.

| 명령어 | 동작 |
| --- | --- |
| `!명령어` | 사용 가능한 명령어 목록 |
| `!노래` | 현재 재생 중인 곡 |
| `!노래 신청 <검색어>` | Spotify에서 검색해 대기열에 추가 |
| `!노래 취소` | 대기 중인 내 신청곡 취소 |

## DB 마이그레이션

```bash
alembic upgrade head
alembic revision --autogenerate -m "변경사항"
```

## 테스트

```bash
pytest
ruff check .
ruff format .
```
