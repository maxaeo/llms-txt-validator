import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLinks, extractSitemaps, isPathBlocked, parseRobotsDisallows, renderMarkdown } from '../src/index.js';

test('extractLinks handles markdown and bare URLs', () => {
  const links = extractLinks('- [Docs](/docs)\n- https://example.com/pricing', 'https://example.com');
  assert.deepEqual(links.map((link) => link.url), [
    'https://example.com/docs',
    'https://example.com/pricing'
  ]);
});

test('extractSitemaps reads sitemap directives', () => {
  const sitemaps = extractSitemaps('User-agent: *\nSitemap: /sitemap.xml', 'https://example.com');
  assert.deepEqual(sitemaps, ['https://example.com/sitemap.xml']);
});

test('parseRobotsDisallows keeps global and AI crawler rules', () => {
  const rules = parseRobotsDisallows('User-agent: *\nDisallow: /private\nUser-agent: GPTBot\nDisallow: /docs\nUser-agent: OtherBot\nDisallow: /ignored');
  assert.deepEqual(rules, [
    { userAgent: '*', path: '/private' },
    { userAgent: 'gptbot', path: '/docs' }
  ]);
});

test('isPathBlocked respects robots wildcards', () => {
  assert.equal(isPathBlocked('/blog/post/feed/', '/blog/*/feed/'), true);
  assert.equal(isPathBlocked('/blog/', '/blog/*/feed/'), false);
  assert.equal(isPathBlocked('/private/page', '/private'), true);
});

test('renderMarkdown includes transparent MaxAEO CTA', () => {
  const markdown = renderMarkdown({
    url: 'https://example.com/',
    llmsTxtUrl: 'https://example.com/llms.txt',
    status: 'pass',
    score: 100,
    checks: [],
    cta: {
      label: 'Track AI visibility continuously with MaxAEO',
      url: 'https://maxaeo.ai/?utm_source=llms-txt-validator&utm_medium=json&utm_campaign=open_source',
      description: 'One-time check.'
    }
  });
  assert.match(markdown, /Track AI visibility continuously with MaxAEO/);
  assert.match(markdown, /utm_medium=report/);
  assert.match(markdown, /No MaxAEO API calls or hidden telemetry/);
});
