/**
 * Deterministic JSON writers. `toPrettyJson` matches Prettier's output for the shapes we write
 * (objects always expanded, short primitive arrays inline), so `pnpm format:check` agrees with
 * the generator. `toTiledJson` prints tile layer `data` one map row per line, like Tiled does.
 */

const PRINT_WIDTH = 100;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

function isPrimitive(value: Json): value is null | boolean | number | string {
  return value === null || typeof value !== 'object';
}

interface Options {
  /** Row length of arrays stored under the key `data` (Tiled tile layers). */
  readonly dataRowLength?: number;
}

function write(
  value: Json,
  indent: string,
  prefixLength: number,
  key: string | null,
  options: Options,
): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isPrimitive)) {
      const rowLength = key === 'data' ? options.dataRowLength : undefined;
      if (rowLength !== undefined) {
        const rows: string[] = [];
        for (let i = 0; i < value.length; i += rowLength) {
          rows.push(
            `${inner}${value
              .slice(i, i + rowLength)
              .map((v) => JSON.stringify(v))
              .join(', ')}`,
          );
        }
        return `[\n${rows.join(',\n')}\n${indent}]`;
      }
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (prefixLength + inline.length + 1 <= PRINT_WIDTH) return inline;
      if (value.every((v) => typeof v === 'number')) {
        // Prettier "fills" number arrays: as many items per line as fit.
        const lines: string[] = [];
        let line = '';
        value.forEach((v, i) => {
          const item = `${JSON.stringify(v)}${i < value.length - 1 ? ',' : ''}`;
          const candidate = line === '' ? item : `${line} ${item}`;
          if (line !== '' && inner.length + candidate.length > PRINT_WIDTH) {
            lines.push(line);
            line = item;
          } else line = candidate;
        });
        lines.push(line);
        return `[\n${lines.map((l) => `${inner}${l}`).join('\n')}\n${indent}]`;
      }
    }
    return `[\n${value.map((v) => `${inner}${write(v, inner, inner.length, null, options)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, Json] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v]) => {
    const head = `${inner}${JSON.stringify(k)}: `;
    return `${head}${write(v, inner, head.length, k, options)}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

export function toPrettyJson(value: Json): string {
  return `${write(value, '', 0, null, {})}\n`;
}

export function toTiledJson(value: Json, width: number): string {
  return `${write(value, '', 0, null, { dataRowLength: width })}\n`;
}

export type { Json };
