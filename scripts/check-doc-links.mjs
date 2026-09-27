// Checks every relative link of the tracked Markdown files: the target file or folder must exist
// and, for a `#fragment` into a Markdown file, a heading of that file must have that anchor
// (GitHub's slugs). External links (http, https, mailto) are not checked. Exits 1 on a broken link.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter((file) => file && existsSync(join(root, file)));

/** Markdown text without fenced code blocks and inline code spans. */
function prose(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

/** GitHub's heading anchor: lower case, punctuation removed, spaces as hyphens. */
function slug(heading) {
  return (
    heading
      .replace(/<[^>]+>/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Emphasis markers are not part of the rendered text (`_staging_`, `**E8**`).
      .replace(/(^|[^\p{L}\p{N}])[*_]+|[*_]+(?=[^\p{L}\p{N}]|$)/gu, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/\s/g, '-')
  );
}

const anchorCache = new Map();
function anchors(file) {
  if (!anchorCache.has(file)) {
    const seen = new Map();
    const result = new Set();
    const text = readFileSync(file, 'utf8').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
    for (const [, heading] of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
      const base = slug(heading.replace(/`/g, ''));
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      result.add(count === 0 ? base : `${base}-${String(count)}`);
    }
    for (const [, id] of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) result.add(id);
    anchorCache.set(file, result);
  }
  return anchorCache.get(file);
}

const broken = [];
let checked = 0;
for (const file of files) {
  const text = prose(readFileSync(join(root, file), 'utf8'));
  const targets = [
    ...[...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/gm)].map(
      (match) => match[1],
    ),
  ];
  for (const target of targets) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    checked += 1;
    const [pathPart, fragment] = target.split('#');
    const path = decodeURIComponent(pathPart);
    const resolved = path ? resolve(root, dirname(file), path) : join(root, file);
    if (!resolved.startsWith(root) || !existsSync(resolved)) {
      broken.push(`${file}: ${target} (missing ${relative(root, resolved) || resolved})`);
      continue;
    }
    if (fragment && resolved.endsWith('.md') && statSync(resolved).isFile()) {
      if (!anchors(resolved).has(decodeURIComponent(fragment).toLowerCase())) {
        broken.push(`${file}: ${target} (no heading #${fragment} in ${relative(root, resolved)})`);
      }
    }
  }
}

for (const line of broken) process.stderr.write(`${line}\n`);
process.stdout.write(
  `${String(files.length)} Markdown files, ${String(checked)} relative links, ${String(broken.length)} broken.\n`,
);
process.exit(broken.length === 0 ? 0 : 1);
