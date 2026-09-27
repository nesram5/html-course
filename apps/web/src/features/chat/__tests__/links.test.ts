import { describe, expect, it } from 'vitest';

import { splitLinks } from '../lib/links';

describe('splitLinks (E7-S3)', () => {
  it('finds http(s) and www links, leaving sentence punctuation out', () => {
    expect(splitLinks('Mira https://bululu.app/docs?x=1, y www.acme.com.')).toEqual([
      { kind: 'text', text: 'Mira ' },
      { kind: 'link', text: 'https://bululu.app/docs?x=1', href: 'https://bululu.app/docs?x=1' },
      { kind: 'text', text: ', y ' },
      { kind: 'link', text: 'www.acme.com', href: 'https://www.acme.com/' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('never turns other schemes or markup into links', () => {
    expect(splitLinks('javascript:alert(1) <a href="x">hola</a>')).toEqual([
      { kind: 'text', text: 'javascript:alert(1) <a href="x">hola</a>' },
    ]);
  });

  it('returns plain text untouched', () => {
    expect(splitLinks('Hola equipo')).toEqual([{ kind: 'text', text: 'Hola equipo' }]);
  });
});
