# Security

World News Globe is plain files on Cloudflare: no accounts, no cookies, no database and no server
code that visitors can reach. The parts that can change the site are protected as described below.

## Reporting a vulnerability

Please report security issues privately through the contact form at
<https://krimadev.com/contact/> (topic "Something else"), not in a public issue. You will get an
answer within a few days. The same contact is published in
[`/.well-known/security.txt`](frontend/public/.well-known/security.txt).

## What needs protecting

| Asset                         | Where                                     | Protection                                                                                                                                         |
| ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Cloudflare deploy token   | GitHub, environment `production`          | Never in the repository. Limited to the one Worker `world-news-globe`, with an expiry date. Only the deploy job, on `main`, can read it            |
| The GitHub token of the timer | Cloudflare, secret of the timer Worker    | Never in the repository. Fine-grained: this repository only, Actions read and write                                                                |
| The published data            | Written by `.github/workflows/update.yml` | Text from feeds is escaped before it reaches a page, only web links are kept, and the Content-Security-Policy allows no script written into a page |

## Other measures

- **Security headers** on every page (`frontend/public/_headers`): HTTPS only, no framing, `nosniff`, a strict referrer policy, a Content-Security-Policy with no inline scripts.
- **GitHub Actions** are pinned to exact commits, read-only by default, and the job that reads feeds and builds the site has no secrets at all.
- **Dependencies:** exact versions, no new version until it is two weeks old (Dependabot's cooldown). The pipeline uses only Python's standard library at run time.
