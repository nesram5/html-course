import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { avatarsFixture } from '@/test/fixtures';
import { mockApi } from '@/test/mock-api';
import { renderWithProviders } from '@/test/providers';

import { AvatarPicker } from '../components/AvatarPicker';

function Picker() {
  const [value, setValue] = useState<string | null>(null);
  return <AvatarPicker value={value} onChange={setValue} />;
}

describe('AvatarPicker keyboard (radio group)', () => {
  it('is one Tab stop and the arrow keys choose the next or previous avatar', async () => {
    mockApi({ 'GET /api/avatars': { body: { avatars: avatarsFixture } } });
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);

    await user.tab();
    expect(radios[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(radios.at(-1)).toHaveAttribute('aria-checked', 'true');
  });
});
