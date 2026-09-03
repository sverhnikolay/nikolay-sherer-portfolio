# Production

Public URL: https://sherer-dev.ru/

Nginx serves `/var/www/nikolay-portfolio/current`, a symlink to a versioned release.
The previous releases remain available for rollback. Deploying the site must not
delete `/etc/letsencrypt` or replace the Certbot environment.

The primary trusted Let's Encrypt certificate covers `sherer-dev.ru` and
`www.sherer-dev.ru`. An additional short-lived IP certificate is kept only so
direct visits to the server address can redirect safely to the domain. Certbot
5.8.0 lives in `/opt/portfolio-certbot`. The systemd timer
`portfolio-certbot-renew.timer` checks renewal every six hours, with up to 30 minutes
of jitter. The certificate renewal configuration stores the deploy hook
`nginx -t && systemctl reload nginx`. HTTP ACME challenges bypass the HTTPS redirect.

Checks on the server:

```sh
systemctl list-timers portfolio-certbot-renew.timer
/opt/portfolio-certbot/bin/certbot renew --dry-run --run-deploy-hooks
nginx -t
```

Never add private keys or account credentials to this repository.
