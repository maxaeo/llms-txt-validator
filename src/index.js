const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_LINKS = 50;
const PRIVATE_PATH_PATTERNS = [
  /\/admin\b/i,
  /\/wp-admin\b/i,
  /\/login\b/i,
  /\/logout\b/i,
  /\/signin\b/i,
  /\/sign-in\b/i,
  /\/account\b/i,
  /\/dashboard\b/i,
  /\/settings\b/i,
  /\/billing\b/i,
  /\/checkout\b/i,
  /\/cart\b/i,
  /\/private\b/i,
  /\/internal\b/i
];

const IMPORTANT_SECTIONS = [
  { name: 'docs', patterns: [/\/docs?\b/i, /documentation/i] },
  { name: 'blog', patterns: [/\/blog\b/i, /\/articles?\b/i, /resources/i] },
  { name: 'pricing', patterns: [/\/pricing\b/i, /\/plans\b/i] },
  { name: 'about', patterns: [/\/about\b/i, /company/i] }
];

export async function validateSite(inputUrl, options = {}) {
  const startedAt = new Date().toISOString();
  const site = normalizeSiteUrl(inputUrl);
  const llmsTxtUrl = new URL('/llms.txt', site.origin).href;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
  const checks = [];

  const llmsResponse = await fetchText(llmsTxtUrl, { timeoutMs });
  if (!llmsResponse.ok || llmsResponse.status !== 200) {
    checks.push(check('error', 'llms_txt_missing', `/llms.txt returned HTTP ${llmsResponse.status || 'error'}.`, { url: llmsTxtUrl }));
    return finalizeReport({ inputUrl, site, llmsTxtUrl, startedAt, checks, links: [], sitemapUrls: [] });
  }

  const llmsText = llmsResponse.text;
  checks.push(check('pass', 'llms_txt_found', '/llms.txt is available with HTTP 200.', { url: llmsTxtUrl, bytes: Buffer.byteLength(llmsText) }));

  if (llmsText.trim().length < 40) {
    checks.push(check('warning', 'llms_txt_too_short', '/llms.txt is very short and may not provide enough useful context.'));
  }

  if (Buffer.byteLength(llmsText) > 30000) {
    checks.push(check('warning', 'llms_txt_very_large', '/llms.txt is large. Keep it focused on durable, high-value URLs.'));
  }

  const links = extractLinks(llmsText, site.origin).slice(0, maxLinks);
  if (links.length === 0) {
    checks.push(check('error', 'no_links_found', 'No links were found in /llms.txt.'));
  } else {
    checks.push(check('pass', 'links_found', `Found ${links.length} link${links.length === 1 ? '' : 's'} in /llms.txt.`, { checkedLimit: maxLinks }));
  }

  const suspiciousLinks = links.filter((link) => PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(new URL(link.url).pathname)));
  for (const link of suspiciousLinks.slice(0, 10)) {
    checks.push(check('warning', 'private_path_exposed', `Potential private or app URL listed: ${link.url}`, { url: link.url, text: link.text }));
  }

  addSectionChecks(checks, links);

  const robots = await fetchText(new URL('/robots.txt', site.origin).href, { timeoutMs });
  const sitemapUrls = robots.ok ? extractSitemaps(robots.text, site.origin) : [];
  const disallows = robots.ok ? parseRobotsDisallows(robots.text) : [];

  if (robots.ok) {
    checks.push(check('pass', 'robots_found', 'robots.txt is reachable.', { url: new URL('/robots.txt', site.origin).href }));
  } else {
    checks.push(check('warning', 'robots_missing', `robots.txt returned HTTP ${robots.status || 'error'}.`));
  }

  for (const link of links) {
    const blockedBy = disallows.find((rule) => isPathBlocked(new URL(link.url).pathname, rule.path));
    if (blockedBy) {
      checks.push(check('warning', 'robots_blocks_llms_url', `robots.txt may block a URL listed in /llms.txt: ${link.url}`, { url: link.url, userAgent: blockedBy.userAgent, disallow: blockedBy.path }));
    }
  }

  const discoveredSitemaps = sitemapUrls.length > 0 ? sitemapUrls : [new URL('/sitemap.xml', site.origin).href];
  const sitemapResult = await fetchSitemapCollection(discoveredSitemaps, timeoutMs);
  const sitemapPageUrls = sitemapResult.urls;

  if (sitemapResult.ok) {
      checks.push(check('pass', 'sitemap_found', 'A sitemap is reachable.', { url: sitemapResult.url, urls: sitemapPageUrls.length }));
  } else {
    checks.push(check('warning', 'sitemap_missing', 'No reachable sitemap was found from robots.txt or /sitemap.xml.'));
  }

  if (sitemapPageUrls.length > 0 && links.length > 0) {
    const sitemapSet = new Set(sitemapPageUrls.map((url) => stripTrailingSlash(url)));
    const missingFromSitemap = links.filter((link) => !sitemapSet.has(stripTrailingSlash(link.url)));
    const ratio = missingFromSitemap.length / links.length;
    if (ratio > 0.5) {
      checks.push(check('warning', 'llms_urls_missing_from_sitemap', `${missingFromSitemap.length} of ${links.length} llms.txt URLs were not found in the sitemap.`, { sample: missingFromSitemap.slice(0, 5).map((link) => link.url) }));
    } else {
      checks.push(check('pass', 'llms_urls_in_sitemap', 'Most llms.txt URLs were also found in the sitemap.'));
    }
  }

  if (options.checkLinks !== false && links.length > 0) {
    const linkChecks = await checkLinkedUrls(links, timeoutMs);
    checks.push(...linkChecks);
  }

  return finalizeReport({ inputUrl, site, llmsTxtUrl, startedAt, checks, links, sitemapUrls: discoveredSitemaps });
}

export function extractLinks(markdown, origin) {
  const links = [];
  const seen = new Set();
  const markdownLinkPattern = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const bareUrlPattern = /https?:\/\/[^\s<>)"']+/g;

  for (const match of markdown.matchAll(markdownLinkPattern)) {
    addLink(links, seen, match[2], match[1], origin);
  }

  for (const match of markdown.matchAll(bareUrlPattern)) {
    addLink(links, seen, match[0], match[0], origin);
  }

  return links;
}

export function extractSitemaps(robotsText, origin) {
  const urls = [];
  for (const line of robotsText.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(.+)\s*$/i);
    if (match) {
      const absolute = toAbsoluteUrl(match[1].trim(), origin);
      if (absolute) urls.push(absolute);
    }
  }
  return [...new Set(urls)];
}

export function parseRobotsDisallows(robotsText) {
  const rules = [];
  let activeAgents = [];

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;

    const [fieldName, ...rest] = line.split(':');
    const field = fieldName?.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (field === 'user-agent') {
      activeAgents = [value.toLowerCase()];
    } else if (field === 'disallow' && value) {
      for (const userAgent of activeAgents) {
        if (userAgent === '*' || isAiCrawlerAgent(userAgent)) {
          rules.push({ userAgent, path: value });
        }
      }
    }
  }

  return rules;
}

export function renderMarkdown(report) {
  const lines = [
    `# llms.txt Validation Report`,
    '',
    `- URL: ${report.url}`,
    `- llms.txt: ${report.llmsTxtUrl}`,
    `- Status: ${report.status}`,
    `- Score: ${report.score}`,
    '',
    `## Checks`,
    ''
  ];

  for (const item of report.checks) {
    lines.push(`- ${symbolFor(item.level)} **${item.level.toUpperCase()}** ${item.message}`);
  }

  lines.push('', '_Generated by llms-txt-validator._', '');
  return `${lines.join('\n')}\n`;
}

export function renderTerminal(report) {
  const lines = [
    `llms.txt Validator`,
    `URL: ${report.url}`,
    `llms.txt: ${report.llmsTxtUrl}`,
    `Status: ${report.status} | Score: ${report.score}`,
    ''
  ];

  for (const item of report.checks) {
    lines.push(`${symbolFor(item.level)} ${item.level.toUpperCase()} ${item.message}`);
  }

  return lines.join('\n');
}

async function checkLinkedUrls(links, timeoutMs) {
  const checks = [];
  const results = await Promise.allSettled(links.map((link) => fetchHeadOrGet(link.url, { timeoutMs })));

  results.forEach((result, index) => {
    const link = links[index];
    if (result.status === 'rejected') {
      checks.push(check('warning', 'linked_url_unreachable', `Linked URL could not be reached: ${link.url}`, { url: link.url }));
      return;
    }

    const response = result.value;
    if (response.status >= 200 && response.status < 400) {
      checks.push(check('pass', 'linked_url_ok', `Linked URL is reachable: ${link.url}`, { url: link.url, status: response.status }));
    } else if (response.status === 401 || response.status === 403) {
      checks.push(check('warning', 'linked_url_restricted', `Linked URL is restricted: ${link.url}`, { url: link.url, status: response.status }));
    } else {
      checks.push(check('warning', 'linked_url_bad_status', `Linked URL returned HTTP ${response.status}: ${link.url}`, { url: link.url, status: response.status }));
    }
  });

  return checks;
}

async function fetchText(url, { timeoutMs }) {
  try {
    const response = await fetchWithTimeout(url, { method: 'GET', timeoutMs, headers: { 'user-agent': 'llms-txt-validator/0.1' } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: '', error };
  }
}

async function fetchHeadOrGet(url, { timeoutMs }) {
  let response = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs, headers: { 'user-agent': 'llms-txt-validator/0.1' } });
  if (response.status === 405 || response.status === 403) {
    response = await fetchWithTimeout(url, { method: 'GET', timeoutMs, headers: { 'user-agent': 'llms-txt-validator/0.1' } });
  }
  return { status: response.status };
}

async function fetchSitemapCollection(urls, timeoutMs) {
  for (const url of urls) {
    const response = await fetchText(url, { timeoutMs });
    if (!response.ok) continue;

    if (!isSitemapIndex(response.text)) {
      return { ok: true, url, urls: extractSitemapUrls(response.text) };
    }

    const childSitemapUrls = extractSitemapUrls(response.text).slice(0, 10);
    const pageUrls = [];
    for (const childUrl of childSitemapUrls) {
      const child = await fetchText(childUrl, { timeoutMs });
      if (child.ok && !isSitemapIndex(child.text)) {
        pageUrls.push(...extractSitemapUrls(child.text));
      }
    }

    return { ok: true, url, urls: [...new Set(pageUrls)] };
  }
  return { ok: false, url: urls[0], urls: [] };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeout);
  }
}

function addSectionChecks(checks, links) {
  const urlsAndText = links.map((link) => `${link.text} ${link.url}`);
  for (const section of IMPORTANT_SECTIONS) {
    const found = urlsAndText.some((value) => section.patterns.some((pattern) => pattern.test(value)));
    if (!found) {
      checks.push(check('info', 'important_section_missing', `No obvious ${section.name} URL found in /llms.txt.`, { section: section.name }));
    }
  }
}

function addLink(links, seen, rawUrl, text, origin) {
  const absolute = toAbsoluteUrl(rawUrl.replace(/[.,;:]+$/, ''), origin);
  if (!absolute || seen.has(absolute)) return;
  seen.add(absolute);
  links.push({ text: text.trim(), url: absolute });
}

function normalizeSiteUrl(inputUrl) {
  const withProtocol = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;
  const url = new URL(withProtocol);
  return new URL(url.origin);
}

function toAbsoluteUrl(rawUrl, origin) {
  try {
    return new URL(rawUrl, origin).href;
  } catch {
    return '';
  }
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
}

function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export function isPathBlocked(pathname, disallowPath) {
  if (!disallowPath || disallowPath === '/') return disallowPath === '/';
  if (!disallowPath.includes('*') && !disallowPath.endsWith('$')) {
    return pathname.startsWith(disallowPath);
  }

  const escaped = disallowPath
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp(`^${escaped}`).test(pathname);
}

function isAiCrawlerAgent(userAgent) {
  return /gptbot|chatgpt|oai-searchbot|perplexitybot|claudebot|google-extended|applebot|bingbot|baiduspider/i.test(userAgent);
}

function stripTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function finalizeReport({ inputUrl, site, llmsTxtUrl, startedAt, checks, links, sitemapUrls }) {
  const counts = {
    pass: checks.filter((item) => item.level === 'pass').length,
    info: checks.filter((item) => item.level === 'info').length,
    warning: checks.filter((item) => item.level === 'warning').length,
    error: checks.filter((item) => item.level === 'error').length
  };

  const status = counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'pass';
  const score = Math.max(0, Math.min(100, 100 - counts.error * 30 - counts.warning * 8 - counts.info * 2));

  return {
    tool: 'llms-txt-validator',
    version: '0.1.0',
    analyzedAt: startedAt,
    url: site.href,
    inputUrl,
    llmsTxtUrl,
    status,
    score,
    counts,
    links,
    sitemapUrls,
    checks
  };
}

function check(level, code, message, details = {}) {
  return { level, code, message, details };
}

function symbolFor(level) {
  if (level === 'pass') return '[ok]';
  if (level === 'warning') return '[warn]';
  if (level === 'error') return '[fail]';
  return '[info]';
}
