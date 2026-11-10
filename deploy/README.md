# 서비스 로그 보관 (90일)

개인정보 처리방침에 따라 90일간 컨테이너 로그를 시스템 저널에 저장 후 삭제합니다.

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo cp deploy/journald-retention.conf /etc/systemd/journald.conf.d/retention.conf
sudo systemctl restart systemd-journald
sudo cp deploy/docker-daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
docker compose up -d --force-recreate   # 적용 후 생성된 컨테이너에 대해서 적용됨
```
