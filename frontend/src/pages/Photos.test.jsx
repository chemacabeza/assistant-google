import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { loginAs, mockLocation, renderWithProviders } from '../test/utils';
import Photos from './Photos';

function mockPhotos({ statuses = [{ mediaItemsSet: true }], media = [], sessionStatus = 200, mediaStatus = 200 } = {}) {
  const calls = { sessions: 0, polls: 0, mediaParams: [] };
  server.use(
    http.post('/api/photos/session', () => {
      calls.sessions += 1;
      if (sessionStatus !== 200) return HttpResponse.json({ message: 'Insufficient scopes' }, { status: sessionStatus });
      return HttpResponse.json({ id: 'sess-1', pickerUri: 'https://photos.google.com/picker/sess-1' });
    }),
    http.get('/api/photos/session/:id', ({ params }) => {
      const status = statuses[Math.min(calls.polls, statuses.length - 1)];
      calls.polls += 1;
      return HttpResponse.json({ id: params.id, ...status });
    }),
    http.get('/api/photos/media', ({ request }) => {
      calls.mediaParams.push(new URL(request.url).searchParams);
      if (mediaStatus !== 200) return HttpResponse.json({ message: 'Media failed' }, { status: mediaStatus });
      return HttpResponse.json({ mediaItems: media });
    }),
  );
  return calls;
}

describe('Photos page', () => {
  beforeEach(() => loginAs());

  it('prompts the user to pick photos and shows the account selector', async () => {
    renderWithProviders(<Photos />);
    expect(screen.getByRole('heading', { name: 'Select Photos to View' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('primary@example.com'));
    expect(screen.getByRole('link', { name: 'Exit' })).toHaveAttribute('href', '/dashboard');
  });

  it('opens the Google Picker, waits for the selection, then shows the photo grid', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const calls = mockPhotos({
      statuses: [{ mediaItemsSet: true }],
      media: [
        { id: 'p1', baseUrl: 'https://lh3/p1', filename: 'beach.jpg' },
        { id: 'p2', baseUrl: 'https://lh3/p2' },
      ],
    });
    const { user } = renderWithProviders(<Photos />);

    await user.click(screen.getByRole('button', { name: 'Select Photos from Google' }));

    expect(open).toHaveBeenCalledWith('https://photos.google.com/picker/sess-1/autoclose', '_blank');

    expect(await screen.findByRole('img', { name: 'beach.jpg' })).toHaveAttribute('src', 'https://lh3/p1=w500-h500-c');
    expect(screen.getByRole('img', { name: 'Photo' })).toHaveAttribute('src', 'https://lh3/p2=w500-h500-c');
    expect(calls.sessions).toBe(1);
    expect(calls.mediaParams[0].get('sessionId')).toBe('sess-1');
    expect(calls.mediaParams[0].get('pageSize')).toBe('50');
  });

  it('shows the empty result and lets the user try again', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockPhotos({ media: [] });
    const { user } = renderWithProviders(<Photos />);
    await user.click(screen.getByRole('button', { name: 'Select Photos from Google' }));

    expect(await screen.findByText('No photos returned.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('heading', { name: 'Select Photos to View' })).toBeInTheDocument();
  });

  it('shows an authorization error when the session cannot be created and offers re-auth', async () => {
    const { hrefSet } = mockLocation();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mockPhotos({ sessionStatus: 403 });
    const { user } = renderWithProviders(<Photos />);
    await user.click(screen.getByRole('button', { name: 'Select Photos from Google' }));

    expect(await screen.findByText('Authorization Error')).toBeInTheDocument();
    expect(screen.getByText('Error details: Insufficient scopes')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /log out & re-authenticate/i }));
    await waitFor(() => expect(hrefSet).toHaveBeenCalledWith('/oauth2/authorization/google'));
  });

  it('shows an error when listing media fails', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockPhotos({ mediaStatus: 500 });
    const { user } = renderWithProviders(<Photos />);
    await user.click(screen.getByRole('button', { name: 'Select Photos from Google' }));
    expect(await screen.findByText('Error details: Media failed')).toBeInTheDocument();
  });

  it('keeps polling the session until the selection is complete', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const calls = mockPhotos({
      statuses: [{ mediaItemsSet: false }, { mediaItemsSet: true }],
      media: [{ id: 'p1', baseUrl: 'https://lh3/p1', filename: 'one.jpg' }],
    });
    const { user } = renderWithProviders(<Photos />);
    await user.click(screen.getByRole('button', { name: 'Select Photos from Google' }));

    await waitFor(() => expect(calls.polls).toBe(1));
    expect(screen.getByRole('heading', { name: 'Waiting for selection...' })).toBeInTheDocument();
    // Second poll happens after the 3s refetchInterval.
    expect(await screen.findByRole('img', { name: 'one.jpg' }, { timeout: 5000 })).toBeInTheDocument();
    expect(calls.polls).toBe(2);
  });
});
