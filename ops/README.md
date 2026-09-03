# Production

Public URL: https://72.56.240.148/

Nginx serves `/var/www/nikolay-portfolio/current`, a symlink to a versioned release.
The previous releases remain available for rollback. Deploying the site must not
delete `/etc/letsencrypt` or replace the Certbot environment.

The trusted Let's Encrypt IP certificate is short-lived (about six days).
Certbot 5.8.0 lives in `/opt/portfolio-certbot`. The systemd timer
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
