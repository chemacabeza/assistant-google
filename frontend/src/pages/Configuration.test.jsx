import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { readJson, renderWithProviders } from '../test/utils';
import Configuration from './Configuration';

const env = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'shh',
  OPENAI_API_KEY: 'sk-test',
  VITE_GOOGLE_MAPS_API_KEY: 'maps-key',
  WHATSAPP_PHONE_NUMBER: '+33123456789',
};

function mockConfig({ getStatus = 200, saveResponse = { success: true, message: 'Configuration saved. Restart containers to apply changes.' } } = {}) {
  const saved = [];
  server.use(
    http.get('/api/config/env', () => (getStatus === 200 ? HttpResponse.json(env) : new HttpResponse(null, { status: getStatus }))),
    http.post('/api/config/env', async ({ request }) => {
      saved.push(await readJson(request));
      return typeof saveResponse === 'function' ? saveResponse() : HttpResponse.json(saveResponse);
    }),
  );
  return saved;
}

const field = (label) => screen.getByPlaceholderText(`Enter your ${label}...`);

describe('Configuration page', () => {
  it('shows a loading state, then the keys from the backend .env', async () => {
    mockConfig();
    renderWithProviders(<Configuration />);
    expect(screen.getByText('Loading configuration from .env...')).toBeInTheDocument();

    expect(await screen.findByDisplayValue('sk-test')).toBeInTheDocument();
    expect(field('Google Client ID')).toHaveValue(env.GOOGLE_CLIENT_ID);
    expect(field('WhatsApp Access Token')).toHaveValue('');
    expect(field('OpenAI API Key')).toHaveAttribute('type', 'password');
    expect(screen.getByPlaceholderText('Personal AI Assistant')).toHaveValue('Personal AI Assistant');
    // Linked accounts manager is embedded.
    expect(await screen.findByText('primary@example.com')).toBeInTheDocument();
  });

  it('restores UI-only settings from localStorage', async () => {
    localStorage.setItem('assistant_ui_config', JSON.stringify({ appName: 'Jarvis', emailInvitees: false }));
    mockConfig();
    renderWithProviders(<Configuration />);
    expect(await screen.findByDisplayValue('Jarvis')).toBeInTheDocument();
  });

  it('toggles key visibility', async () => {
    mockConfig();
    const { user } = renderWithProviders(<Configuration />);
    await screen.findByDisplayValue('sk-test');
    const [firstShow] = screen.getAllByRole('button', { name: 'Show' });
    await user.click(firstShow);
    expect(field('Google Client ID')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(field('Google Client ID')).toHaveAttribute('type', 'password');
  });

  it('saves API keys to the backend and UI settings to localStorage', async () => {
    const saved = mockConfig();
    const { user } = renderWithProviders(<Configuration />);
    await screen.findByDisplayValue('sk-test');

    await user.clear(screen.getByPlaceholderText('Personal AI Assistant'));
    await user.type(screen.getByPlaceholderText('Personal AI Assistant'), 'Jarvis');
    await user.clear(field('OpenAI API Key'));
    await user.type(field('OpenAI API Key'), 'sk-new');
    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    expect(await screen.findByText('Configuration saved. Restart containers to apply changes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saved/i })).toBeInTheDocument();
    expect(saved).toEqual([{
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: 'shh',
      OPENAI_API_KEY: 'sk-new',
      VITE_GOOGLE_MAPS_API_KEY: 'maps-key',
      WHATSAPP_PHONE_NUMBER: '+33123456789',
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_VERIFY_TOKEN: '',
    }]);
    expect(JSON.parse(localStorage.getItem('assistant_ui_config'))).toEqual({ appName: 'Jarvis', emailInvitees: true });
  });

  it('shows the backend message when the save is rejected', async () => {
    mockConfig({ saveResponse: { success: false, message: 'Failed to save: read-only file system' } });
    const { user } = renderWithProviders(<Configuration />);
    await screen.findByDisplayValue('sk-test');
    await user.click(screen.getByRole('button', { name: /save configuration/i }));
    expect(await screen.findByText('Failed to save: read-only file system')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save configuration/i })).toBeEnabled();
  });

  it('shows an error when the save request fails', async () => {
    mockConfig({ saveResponse: () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 }) });
    const { user } = renderWithProviders(<Configuration />);
    await screen.findByDisplayValue('sk-test');
    await user.click(screen.getByRole('button', { name: /save configuration/i }));
    expect(await screen.findByText('Error saving configuration: Forbidden')).toBeInTheDocument();
  });

  it('links to the Google Cloud console for each required API', async () => {
    mockConfig();
    renderWithProviders(<Configuration />);
    await screen.findByDisplayValue('sk-test');
    const gmail = screen.getByRole('link', { name: /gmail api read, compose/i });
    expect(gmail).toHaveAttribute('href', 'https://console.cloud.google.com/apis/library/gmail.googleapis.com');
    expect(gmail).toHaveAttribute('target', '_blank');
    expect(gmail).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // BUG: if GET /api/config/env fails the page silently renders empty fields, and "Save"
  // then POSTs every key as "" — the backend (ConfigController.saveEnv) overwrites the real
  // values in .env, wiping all credentials. Load errors should be surfaced and saving blocked
  // (or only changed keys sent).
  it.skip('BUG: does not overwrite .env with empty values after a failed load', async () => {
    const saved = mockConfig({ getStatus: 500 });
    const { user } = renderWithProviders(<Configuration />);
    await waitFor(() => expect(screen.queryByText('Loading configuration from .env...')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /save configuration/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(saved).toEqual([]);
  });
});
