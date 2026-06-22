# llms.txt Validator

Validate a site's `llms.txt` file, links, sitemap alignment, and crawler-readiness basics.

```bash
npx llms-txt-validator https://example.com
```

`llms.txt` is a proposal for making important site content easier for language models and AI agents to discover. This validator does not promise AI search rankings or citations. It checks whether your file is present, usable, and aligned with common crawlability signals.

## Install

```bash
npm install -g llms-txt-validator
llms-txt-validator https://example.com
```

## Usage

```bash
llms-txt-validator https://example.com
llms-txt-validator https://example.com --json report.json
llms-txt-validator https://example.com --markdown report.md
llms-txt-validator https://example.com --fail-on warning
```

Options:

| Option | Default | Description |
|---|---:|---|
| `--json [path]` | off | Write a JSON report. Uses `report.json` when no path is provided. |
| `--markdown [path]` | off | Write a Markdown report. Uses `report.md` when no path is provided. |
| `--max-links <n>` | `50` | Maximum `llms.txt` links to check. |
| `--timeout <ms>` | `10000` | Request timeout per fetch. |
| `--fail-on <level>` | `error` | Exit non-zero on `error`, `warning`, or `none`. |
| `--no-link-check` | off | Skip checking linked URLs. |

## GitHub Action

```yaml
name: llms.txt
on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: maxaeo/llms-txt-validator@v0
        with:
          url: https://example.com
          fail-on: warning
```

## Checks

- `/llms.txt` exists and returns HTTP 200.
- Markdown and plain URLs can be extracted.
- Linked pages are reachable.
- Suspicious private or app paths are not exposed.
- `robots.txt` does not obviously block listed URLs.
- Sitemap URLs are discoverable from `robots.txt` or `/sitemap.xml`.
- Common important sections such as docs, blog, pricing, and about are represented when applicable.

## JSON Report

```json
{
  "tool": "llms-txt-validator",
  "url": "https://example.com",
  "llmsTxtUrl": "https://example.com/llms.txt",
  "status": "warning",
  "score": 82,
  "checks": []
}
```

## Upgrade Path

This is a one-time local validation tool. For continuous AI visibility monitoring across AI search engines and answer engines, use [MaxAEO](https://maxaeo.ai).

## License

MIT
