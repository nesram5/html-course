import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const FEATURES_DIR = join(__dirname, '..', '..', 'features');
const FEATURE_IMPORT = /from '@\/features\/([a-z-]+)'/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Feature → features it imports (production code only; tests may cross features). */
function featureGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const feature of readdirSync(FEATURES_DIR)) {
    const deps = new Set<string>();
    for (const file of sourceFiles(join(FEATURES_DIR, feature))) {
      for (const match of readFileSync(file, 'utf8').matchAll(FEATURE_IMPORT)) {
        const target = match[1];
        if (target !== undefined && target !== feature) deps.add(target);
      }
    }
    graph.set(feature, deps);
  }
  return graph;
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null;
    if (state.get(node) === 'visiting') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle !== null) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle !== null) return cycle;
  }
  return null;
}

describe('feature imports (standards §5)', () => {
  it('features never import each other in a cycle', () => {
    expect(findCycle(featureGraph())).toBeNull();
  });

  it('features only import other features through their index', () => {
    const deep = /from '@\/features\/[a-z-]+\//;
    const offenders = sourceFiles(FEATURES_DIR)
      .filter((file) => deep.test(readFileSync(file, 'utf8')))
      .map((file) => relative(FEATURES_DIR, file));
    expect(offenders).toEqual([]);
  });
});
