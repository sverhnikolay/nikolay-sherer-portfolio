#!/bin/sh
set -eu

release=${1:?Commit SHA is required}
case "$release" in *[!0-9a-f]*|'') exit 2;; esac
[ ${#release} -eq 40 ] || exit 2
archive="/tmp/portfolio-release-$release.tar.gz"
target="/var/www/nikolay-portfolio/releases/$release"
previous=$(readlink /var/www/nikolay-portfolio/current || true)

if [ -f /var/lib/portfolio-cms/cms.sqlite3 ]; then
    install -d -m 700 /var/backups/portfolio-cms
    /opt/portfolio-cms/bin/python - <<'PY'
import datetime, sqlite3
from pathlib import Path
name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
source = sqlite3.connect('/var/lib/portfolio-cms/cms.sqlite3')
destination = sqlite3.connect('/var/backups/portfolio-cms/pre-deploy-' + name + '.sqlite3')
source.backup(destination)
destination.close()
source.close()
PY
fi

install -d -m 755 "$target"
tar -xzf "$archive" -C "$target"
chown -R root:root "$target"
ln -sfn "$target" /var/www/nikolay-portfolio/current
install -m 644 "$target/ops/portfolio-cms.service" /etc/systemd/system/portfolio-cms.service
systemctl daemon-reload
systemctl enable portfolio-cms
systemctl restart portfolio-cms

healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:8787/ >/dev/null; then healthy=1; break; fi
    sleep 1
done
if [ "$healthy" != 1 ]; then
    if [ -n "$previous" ]; then
        ln -sfn "$previous" /var/www/nikolay-portfolio/current
        systemctl restart portfolio-cms || true
    fi
    journalctl -u portfolio-cms --no-pager -n 30
    exit 1
fi

cp -p /etc/nginx/sites-available/nikolay-portfolio /etc/nginx/sites-available/nikolay-portfolio.previous
install -m 644 "$target/ops/nginx.conf" /etc/nginx/sites-available/nikolay-portfolio
if ! nginx -t; then
    cp -p /etc/nginx/sites-available/nikolay-portfolio.previous /etc/nginx/sites-available/nikolay-portfolio
    exit 1
fi
systemctl reload nginx
rm -f "$archive"
echo "Deployed $release"
