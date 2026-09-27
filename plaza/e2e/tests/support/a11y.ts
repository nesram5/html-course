import { createRequire } from 'node:module';

import { expect, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
/** axe-core, injected into the page under test (E8-S6). */
const AXE_SOURCE = require.resolve('axe-core/axe.min.js');

/** What the tests read of an axe result. */
export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

declare global {
  interface Window {
    axe?: {
      run(context: unknown, options: unknown): Promise<{ violations: AxeViolation[] }>;
    };
  }
}

/** Impacts that fail the audit (E8-S6: "sin errores críticos"; serious ones are fixed too). */
const FAILING = new Set(['critical', 'serious']);

/** Runs axe on the page as it is now (WCAG 2.x A/AA rules) and returns every violation. */
export async function axeViolations(page: Page): Promise<AxeViolation[]> {
  if (!(await page.evaluate(() => window.axe !== undefined))) {
    await page.addScriptTag({ path: AXE_SOURCE });
  }
  const results = await page.evaluate(() =>
    window.axe?.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
      resultTypes: ['violations'],
    }),
  );
  return results?.violations ?? [];
}

function describe(violations: readonly AxeViolation[]): string[] {
  return violations.map(
    (v) =>
      `${v.impact ?? 'unknown'} ${v.id}: ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

/**
 * Fails when axe finds critical or serious problems on the page (named in the message so a
 * failure says what to fix). `where` names the page state in the report.
 */
export async function expectAccessible(page: Page, where: string): Promise<void> {
  const failing = (await axeViolations(page)).filter((v) => FAILING.has(v.impact ?? ''));
  expect(describe(failing), `accessibility problems in ${where}`).toEqual([]);
}
