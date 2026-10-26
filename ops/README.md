# Production

Public URL: https://sherer-dev.ru/

Nginx serves `/var/www/nikolay-portfolio/current`, a symlink to a versioned release.
The previous releases remain available for rollback. Deploying the site must not
delete `/etc/letsencrypt` or replace the Certbot environment.

The trusted Let's Encrypt certificate covers `sherer-dev.ru` and
`www.sherer-dev.ru`. Direct HTTP visits to the server address redirect to the
canonical domain. Certbot lives in `/opt/portfolio-certbot`. The systemd timer
`portfolio-certbot-renew.timer` checks renewal every six hours, with up to 30 minutes
of jitter. The certificate renewal configuration stores the deploy hook
`nginx -t && systemctl reload nginx`. HTTP ACME challenges bypass the HTTPS redirect.

`nginx-bootstrap.conf` is the temporary HTTP-only configuration used on a fresh
server until DNS points at it and the first certificate has been issued. Replace
it with `nginx.conf` immediately after the certificate is ready.

Checks on the server:

```sh
systemctl list-timers portfolio-certbot-renew.timer
/opt/portfolio-certbot/bin/certbot renew --dry-run --run-deploy-hooks
nginx -t
```

Never add private keys or account credentials to this repository.

## Content editor

The service `portfolio-cms` runs `/opt/portfolio-cms/bin/python` as an unprivileged
user, using the `cms/` code in the current release. Persistent state lives in
`/var/lib/portfolio-cms`, owned by `portfolio-cms:www-data` (directory mode 750).
Its SQLite database must remain private (600), while `media/` and its images
must be readable by Nginx (755 / 644). See `cms/README.md`.

After deploying a new release, restart `portfolio-cms` and check its health
before reloading Nginx. Keep the previous symlink target for rollback. Never
replace the database with local development data. The bootstrap Nginx config
is only for a fresh installation without a certificate or CMS yet.

For an already configured server, commit and push changes, then run
`scripts/deploy.ps1`. It creates a SQLite backup, uploads only the tracked
release, checks the CMS, and applies the Nginx config. The default deployment
server is `135.106.228.32`; no passwords are stored in the script.
