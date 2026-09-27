import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatSpaceExtension } from '@/features/chat';
import { mediaSpaceExtension } from '@/features/media';
import { presenceSpaceExtension } from '@/features/presence';
import { sidePanelStore, type SpaceInfo } from '@/features/world';
import { mockApi } from '@/test/mock-api';
import { renderWithProviders } from '@/test/providers';

import { spaceExtensions } from '../space-extensions';

const SPACE: SpaceInfo = {
  spaceId: 'space-1',
  spaceName: 'Acme',
  userId: 'user-1',
  displayName: 'Ana',
  roomNames: { sala: 'Sala' },
};

/** The bottom-bar controls and the side panels of the E7 extensions, as the office draws them. */
function renderHud() {
  const extensions = [presenceSpaceExtension, chatSpaceExtension];
  return renderWithProviders(
    <>
      <div role="group" aria-label="Tus controles">
        {extensions.map(({ id, BarItems }) =>
          BarItems === undefined ? null : <BarItems key={id} space={SPACE} />,
        )}
      </div>
      {extensions.map(({ id, Panel }) =>
        Panel === undefined ? null : <Panel key={id} space={SPACE} />,
      )}
    </>,
  );
}

beforeEach(() => {
  mockApi({
    'GET /api/spaces/space-1/members': { body: { members: [] } },
    'GET /api/spaces/space-1/messages': { body: { messages: [] } },
  });
});

afterEach(() => {
  sidePanelStore.getState().close();
  vi.unstubAllGlobals();
});

describe('office page extensions', () => {
  it('draw, in order, the hallway media, presence and chat (E5, E7)', () => {
    expect(spaceExtensions).toEqual([
      mediaSpaceExtension,
      presenceSpaceExtension,
      chatSpaceExtension,
    ]);
    expect(mediaSpaceExtension.Gate).toBeDefined();
    expect(mediaSpaceExtension.Overlay).toBeDefined();
    expect(mediaSpaceExtension.BarItems).toBeDefined();
    for (const extension of [presenceSpaceExtension, chatSpaceExtension]) {
      expect(extension.BarItems).toBeDefined();
      expect(extension.Panel).toBeDefined();
    }
  });

  it('opens one side panel at a time and gives the focus back to its button on close', async () => {
    const user = userEvent.setup();
    renderHud();
    const bar = screen.getByRole('group', { name: 'Tus controles' });
    expect(within(bar).getByRole('button', { name: /^Estado:/ })).toBeInTheDocument();
    const people = within(bar).getByRole('button', { name: /^Personas/ });
    const chat = within(bar).getByRole('button', { name: 'Chat del espacio' });
    expect(within(bar).getByRole('button', { name: 'Reaccionar' })).toBeInTheDocument();

    await user.click(people);
    expect(people).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Personas' })).toBeInTheDocument();

    await user.click(chat);
    expect(people).toHaveAttribute('aria-expanded', 'false');
    expect(chat).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('heading', { name: 'Personas' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Chat del espacio' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar el chat' }));
    expect(screen.queryByRole('heading', { name: 'Chat del espacio' })).toBeNull();
    expect(chat).toHaveFocus();

    await user.click(people);
    await user.click(screen.getByRole('button', { name: 'Cerrar la lista de personas' }));
    expect(people).toHaveFocus();
  });
});
