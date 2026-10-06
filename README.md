# 포티봇 PotiBot

치지직 시청자가 채팅으로 스트리머의 Spotify 대기열에 노래를 신청할 수 있게 해 주는 봇입니다.

- 채팅
    - `!노래`로 재생중인 노래 확인
    - `!노래 신청 <검색어>`로 곡을 신청
    - `!노래 취소`로 취소
- [웹 대시보드](https://potibot.insanephin.xyz/)
    - 신청곡 · 재생상태 · 재생기기를 관리합니다.
- [확장 프로그램(권장)](https://chromewebstore.google.com/detail/oagjjkagjahohhmojeiocpkcfmpbaiah)
    - Spotify 웹 플레이어 대기열에 신청곡과 신청자를 함께 표시합니다.

## 구성

```
potibot/
├── backend/            # FastAPI + Socket.io (Python 3.11)
├── frontend/           # React 웹 대시보드 + 확장 프로그램 (Vite, TypeScript)
├── deploy/             # Docker logrotate (3month)
├── docker-compose.yml  # nginx / api / worker / frontend 서비스 정의
└── nginx.conf          # Reverse Proxy
```

## 빠른 시작 (Docker)

```bash
docker compose build api worker # DB 우선 구성
docker compose run --rm api alembic stamp 0001
docker compose run --rm api alembic check
# "No new upgrade operations detected"가 나와야 정상

docker compose up -d # 전체 빌드
```

이후 `http://localhost:8089`로 접속합니다.

## 세부 문서

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## License

[MIT](LICENSE)
