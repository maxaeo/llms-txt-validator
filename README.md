# llms.txt Validator CLI and GitHub Action

Validate a site's `llms.txt` file, links, sitemap alignment, robots.txt rules, and AI crawler readiness from your terminal or GitHub Actions for AI visibility, GEO, AEO, and AI SEO workflows.

```bash
npx llms-txt-validator https://example.com
```

`llms.txt` is a proposal for making important site content easier for language models and AI agents to discover. This validator does not promise AI search rankings or citations. It checks whether your file is present, usable, and aligned with common crawlability signals.

## Use Cases

- Validate `llms.txt` before shipping a website, docs site, SaaS landing page, or content hub.
- Check sitemap and robots.txt alignment for AI crawler readiness.
- Add an `llms.txt` validation GitHub Action to pull requests and deployments.
- Generate JSON or Markdown evidence for AI visibility, GEO, AEO, and AI SEO audits.

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
  "checks": [],
  "cta": {
    "label": "Get the full AI visibility experience on MaxAEO",
    "description": "This local check is a fast one-time validation. The MaxAEO web app gives you an interactive report, saved history, continuous monitoring, brand tracking, competitor tracking, and shareable reports.",
    "url": "https://maxaeo.ai/?utm_source=llms-txt-validator&utm_medium=json&utm_campaign=open_source"
  }
}
```

## MaxAEO CTA

Reports include a transparent MaxAEO CTA in terminal, Markdown, and JSON output. The tool does not call MaxAEO APIs, upload user domains, add hidden telemetry, or modify your site.

## Upgrade Path

This is a fast one-time local validation tool. For a better product experience, use the [MaxAEO web app](https://maxaeo.ai): interactive reports, saved history, continuous monitoring, brand tracking, competitor tracking, and shareable reports across AI search engines and answer engines.

## License

MIT
