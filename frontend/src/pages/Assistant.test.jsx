import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { readJson, renderWithProviders } from '../test/utils';
import Assistant from './Assistant';

function mockAsk(responder) {
  const requests = [];
  server.use(http.post('/api/assistant/ask', async ({ request }) => {
    const body = await readJson(request);
    requests.push(body);
    return responder(body, requests.length);
  }));
  return requests;
}

describe('Assistant page', () => {
  it('greets the user and disables send for empty input', () => {
    renderWithProviders(<Assistant />);
    expect(screen.getByRole('heading', { name: 'How can I help you today?' })).toBeInTheDocument();
    expect(screen.getByText(/I'm your Google Assistant/)).toBeInTheDocument();
    const send = screen.getByPlaceholderText('Ask me anything...').closest('form').querySelector('button[type=submit]');
    expect(send).toBeDisabled();
  });

  it('sends the question, shows a typing indicator and renders the markdown reply', async () => {
    let release;
    const requests = mockAsk(async () => {
      await new Promise((r) => { release = r; });
      return HttpResponse.json({ action: 'CHAT', response: 'You have **two** meetings' });
    });
    const { user, container } = renderWithProviders(<Assistant />);

    const input = screen.getByPlaceholderText('Ask me anything...');
    await user.type(input, 'What is on today?{Enter}');

    expect(input).toHaveValue('');
    expect(screen.getByText('What is on today?')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.animate-bounce')).toHaveLength(3));

    release();
    const strong = await screen.findByText('two');
    expect(strong.tagName).toBe('STRONG');
    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(0);
    // The greeting is not sent as history.
    expect(requests).toEqual([{ query: 'What is on today?', history: [] }]);
  });

  it('sends previous turns as conversation history', async () => {
    const requests = mockAsk((body) => HttpResponse.json({ response: `echo: ${body.query}` }));
    const { user } = renderWithProviders(<Assistant />);
    const input = screen.getByPlaceholderText('Ask me anything...');

    await user.type(input, 'first{Enter}');
    await screen.findByText('echo: first');
    await user.type(input, 'second{Enter}');
    await screen.findByText('echo: second');

    expect(requests[1]).toEqual({
      query: 'second',
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'echo: first' },
      ],
    });
  });

  it('falls back to a default text when the response has none', async () => {
    mockAsk(() => HttpResponse.json({ action: 'UNKNOWN' }));
    const { user } = renderWithProviders(<Assistant />);
    await user.type(screen.getByPlaceholderText('Ask me anything...'), 'hm{Enter}');
    expect(await screen.findByText("Sorry, I couldn't process that.")).toBeInTheDocument();
  });

  it('shows the raw payload for ERROR actions', async () => {
    mockAsk(() => HttpResponse.json({ action: 'ERROR', response: 'Something broke', detail: 'quota' }));
    const { user } = renderWithProviders(<Assistant />);
    await user.type(screen.getByPlaceholderText('Ask me anything...'), 'x{Enter}');
    expect(await screen.findByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText(/"detail": "quota"/)).toBeInTheDocument();
  });

  it('shows an error bubble when the backend is unreachable', async () => {
    mockAsk(() => new HttpResponse(null, { status: 502 }));
    const { user } = renderWithProviders(<Assistant />);
    await user.type(screen.getByPlaceholderText('Ask me anything...'), 'x{Enter}');
    expect(await screen.findByText('Sorry, I encountered an error reaching the backend.')).toBeInTheDocument();
  });

  it('suggestion chips prefill the input', async () => {
    const { user } = renderWithProviders(<Assistant />);
    await user.click(screen.getByRole('button', { name: /show my next meetings/i }));
    expect(screen.getByPlaceholderText('Ask me anything...')).toHaveValue('Show my next meetings');
    await user.click(screen.getByRole('button', { name: /draft an email/i }));
    expect(screen.getByPlaceholderText('Ask me anything...')).toHaveValue('Draft an email to X');
  });
});
