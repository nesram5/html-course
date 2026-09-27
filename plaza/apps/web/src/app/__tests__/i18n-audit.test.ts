import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * i18n audit (E8-S6, RNF-10, standards §5 "nada de strings de UI incrustados"): every text a
 * person can read or hear comes from `t()`. Fails on letters written straight into the JSX of
 * the app: text between tags, string children (`{'Hola'}`, `{ok ? 'Sí' : 'No'}`), the
 * attributes screen readers or tooltips read, and texts given to toasts and browser
 * notifications. Symbols, numbers and punctuation are fine.
 */

const SRC = join(__dirname, '..', '..');
/** Attributes whose value is shown or read aloud. */
const READ_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'alt',
  'placeholder',
  'label',
]);
/** `toast.info('…')`-style calls and `new Notification('…')`: texts shown outside the JSX. */
const TOAST_METHODS = new Set(['info', 'success', 'error']);
/** A letter of any script: text that should have been translated. */
const HAS_WORDS = /\p{L}{2,}/u;

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' || entry === 'test' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [path] : [];
  });
}

function isShownOutsideJsx(node: ts.Node): node is ts.CallExpression | ts.NewExpression {
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === 'Notification';
  }
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'toast' &&
    TOAST_METHODS.has(node.expression.name.text)
  );
}

/** String literals that end up as JSX content (directly or through `?:`, `&&`, `??`). */
function literalTexts(expression: ts.Expression): ts.StringLiteralLike[] {
  if (ts.isStringLiteralLike(expression)) return [expression];
  if (ts.isParenthesizedExpression(expression)) return literalTexts(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [...literalTexts(expression.whenTrue), ...literalTexts(expression.whenFalse)];
  }
  if (ts.isBinaryExpression(expression)) {
    const { kind } = expression.operatorToken;
    if (
      kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return literalTexts(expression.right);
    }
  }
  return [];
}

export function auditSource(fileName: string, source: string): Finding[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const findings: Finding[] = [];
  const report = (node: ts.Node, text: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    findings.push({ file: fileName, line: line + 1, text: text.trim() });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && HAS_WORDS.test(node.text)) report(node, node.text);
    if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      !ts.isJsxAttribute(node.parent)
    ) {
      for (const literal of literalTexts(node.expression)) {
        if (HAS_WORDS.test(literal.text)) report(literal, literal.text);
      }
    }
    if (ts.isJsxAttribute(node) && READ_ATTRIBUTES.has(node.name.getText(file))) {
      const value = node.initializer;
      const literals =
        value === undefined
          ? []
          : ts.isStringLiteral(value)
            ? [value]
            : ts.isJsxExpression(value) && value.expression !== undefined
              ? literalTexts(value.expression)
              : [];
      for (const literal of literals) {
        if (HAS_WORDS.test(literal.text)) report(literal, literal.text);
      }
    }
    if (isShownOutsideJsx(node)) {
      const [first] = node.arguments ?? [];
      for (const literal of first === undefined ? [] : literalTexts(first)) {
        if (HAS_WORDS.test(literal.text)) report(literal, literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

describe('i18n audit (E8-S6)', () => {
  it('finds hard-coded texts, strings and read attributes', () => {
    const source = `
      export const A = () => (
        <div title="Hola" aria-label={ok ? 'Abrir' : 'Cerrar'}>
          Texto suelto
          {'Otro'}
          {ok && 'Más'}
          {t('ok')} · {count} − + ✓ 42 %
          <img alt="" />
          <input placeholder={t('x')} className="px-2 text-sm" data-testid="campo" />
        </div>
      );
      toast.success('Guardado');
      toast.info(t('saved'));
      new Notification(ok ? 'Te llaman' : t('ring'));`;

    expect(auditSource('a.tsx', source).map((finding) => finding.text)).toEqual([
      'Hola',
      'Abrir',
      'Cerrar',
      'Texto suelto',
      'Otro',
      'Más',
      'Guardado',
      'Te llaman',
    ]);
  });

  it('the web app has no text outside i18n', () => {
    const findings = sourceFiles(SRC).flatMap((path) =>
      auditSource(relative(SRC, path), readFileSync(path, 'utf8')),
    );

    expect(findings.map((f) => `${f.file}:${String(f.line)} ${f.text}`)).toEqual([]);
  });
});
