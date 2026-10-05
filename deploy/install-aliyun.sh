#!/usr/bin/env bash
set -Eeuo pipefail
base=/opt/robot-motion-studio
grep -q 'root /var/www/nav;' /etc/nginx/sites-available/frontend || { echo 'Initial installer only: existing homepage is not the original navigation site' >&2; exit 1; }
release="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)"
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release" "$backup"
cp -a /etc/nginx/sites-available/frontend "$backup/frontend"
printf '%s\n' "$release" > "$backup/release"
tar -xzf /tmp/robot-motion-release.tar.gz -C "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
python3 "$release/deploy/normalize-static.py" "$release/out"
cp "$release/deploy/runtime-package.json" "$release/package.json"
cd "$release"
node --input-type=module -e "import { WebSocketServer } from 'ws'; if (!WebSocketServer) process.exit(1)"
if ! id robot-motion >/dev/null 2>&1; then useradd --system --no-create-home --shell /usr/sbin/nologin robot-motion; fi
previous=$(readlink "$base/current" || true)
ln -sfn "$release" "$base/current"
rollback() {
  cp -a "$backup/frontend" /etc/nginx/sites-available/frontend
  nginx -t && systemctl reload nginx
  systemctl disable --now robot-motion-simulator.service || true
  if [ -n "$previous" ]; then ln -sfn "$previous" "$base/current"; fi
  echo "Deployment rolled back; backup: $backup" >&2
}
trap rollback ERR
install -m 644 "$release/deploy/robot-motion-simulator.service" /etc/systemd/system/robot-motion-simulator.service
systemctl daemon-reload
systemctl enable --now robot-motion-simulator.service
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/frontend')
s = p.read_text()
old = '''    location / {
        root /var/www/nav;
        index index.html;
    }'''
assert s.count(old) == 1, 'Unexpected existing Nginx configuration; refusing replacement'
new = '''    root /opt/robot-motion-studio/current/out;
    index index.html;
    error_page 404 /404.html;

    location = /nav { return 302 /nav/; }
    location /nav/ {
        alias /var/www/nav/;
        index index.html;
    }
    location = /ws {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering off;
    }
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri $uri.html $uri/ =404;
        add_header Cache-Control "no-cache";
    }'''
p.write_text(s.replace(old, new))
PY
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 -H 'Host: 121.43.109.134' http://127.0.0.1/ -o /dev/null
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 -H 'Host: 121.43.109.134' http://127.0.0.1/studio -o /dev/null
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 -H 'Host: 121.43.109.134' http://127.0.0.1/nav/ -o /dev/null
systemctl is-active --quiet robot-motion-simulator.service
trap - ERR
printf 'DEPLOYED=%s\nBACKUP=%s\n' "$release" "$backup"
