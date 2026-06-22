#!/usr/bin/env node

import { appendFileSync, writeFileSync } from 'node:fs';
import { validateSite, renderMarkdown, renderTerminal } from '../src/index.js';

const parsed = parseArgs(process.argv.slice(2), process.env);

if (parsed.help) {
  printHelp();
  process.exit(0);
}

if (!parsed.url) {
  console.error('Missing URL. Example: llms-txt-validator https://example.com');
  process.exit(2);
}

try {
  const report = await validateSite(parsed.url, parsed);
  console.log(renderTerminal(report));

  if (parsed.jsonPath) {
    writeFileSync(parsed.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nJSON report written to ${parsed.jsonPath}`);
  }

  if (parsed.markdownPath) {
    const markdown = renderMarkdown(report);
    writeFileSync(parsed.markdownPath, markdown);
    console.log(`Markdown report written to ${parsed.markdownPath}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(report));
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `score=${report.score}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${report.status}\n`);
    if (parsed.jsonPath) {
      appendFileSync(process.env.GITHUB_OUTPUT, `report-json=${parsed.jsonPath}\n`);
    }
  }

  process.exit(exitCodeFor(report, parsed.failOn));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

function parseArgs(args, env) {
  const options = {
    url: env.INPUT_URL || '',
    failOn: env.INPUT_FAIL_ON || 'error',
    maxLinks: Number(env.INPUT_MAX_LINKS || 50),
    timeoutMs: Number(env.INPUT_TIMEOUT || 10000),
    checkLinks: true,
    jsonPath: env.GITHUB_ACTIONS ? 'report.json' : '',
    markdownPath: env.GITHUB_ACTIONS ? 'report.md' : ''
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.jsonPath = readOptionalPath(args, index, 'report.json');
      if (args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
    } else if (arg === '--markdown') {
      options.markdownPath = readOptionalPath(args, index, 'report.md');
      if (args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
    } else if (arg === '--max-links') {
      options.maxLinks = Number(args[index + 1]);
      index += 1;
    } else if (arg === '--timeout') {
      options.timeoutMs = Number(args[index + 1]);
      index += 1;
    } else if (arg === '--fail-on') {
      options.failOn = args[index + 1] || 'error';
      index += 1;
    } else if (arg === '--no-link-check') {
      options.checkLinks = false;
    } else if (!arg.startsWith('--') && !options.url) {
      options.url = arg;
    } else if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!['error', 'warning', 'none'].includes(options.failOn)) {
    throw new Error('--fail-on must be one of: error, warning, none');
  }

  if (!Number.isFinite(options.maxLinks) || options.maxLinks < 0) {
    throw new Error('--max-links must be a positive number');
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error('--timeout must be at least 1000ms');
  }

  return options;
}

function readOptionalPath(args, index, fallback) {
  const next = args[index + 1];
  return next && !next.startsWith('--') ? next : fallback;
}

function exitCodeFor(report, failOn) {
  if (failOn === 'none') return 0;
  if (failOn === 'warning') return report.counts.error > 0 || report.counts.warning > 0 ? 1 : 0;
  return report.counts.error > 0 ? 1 : 0;
}

function printHelp() {
  console.log(`llms-txt-validator

Usage:
  llms-txt-validator https://example.com
  llms-txt-validator https://example.com --json report.json --markdown report.md

Options:
  --json [path]       Write JSON report. Defaults to report.json.
  --markdown [path]   Write Markdown report. Defaults to report.md.
  --max-links <n>     Maximum links to check. Defaults to 50.
  --timeout <ms>      Request timeout. Defaults to 10000.
  --fail-on <level>   error, warning, or none. Defaults to error.
  --no-link-check     Skip linked URL checks.
  --help              Show help.
`);
}

