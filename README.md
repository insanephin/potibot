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
├── backend/            # FastAPI + Socket.io (Python 3.13)
├── frontend/           # React 웹 대시보드 + 확장 프로그램 (Vite, TypeScript)
├── deploy/             # 서비스 로그 90일 보관 (journald)
└── nginx.conf          # Reverse Proxy
```

## 빠른 시작 (Docker)

```bash
docker compose up -d --build # 전체 빌드 + 기동, 없는 DB 테이블은 api가 시작 시 생성
```

이후 `http://localhost:8089`로 접속합니다.

## 세부 문서

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## License

[MIT](LICENSE)
