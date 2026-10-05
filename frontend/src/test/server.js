import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { linkedAccounts, userProfile } from './fixtures';

// Baseline handlers shared by every test. Individual tests override them with server.use(...).
export const defaultHandlers = [
  http.get('/api/auth/profile', () => HttpResponse.json(userProfile)),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/accounts', () => HttpResponse.json(linkedAccounts)),
  http.get('/api/templates', () => HttpResponse.json([])),
  http.get('/api/contacts', () => HttpResponse.json([])),
];

export const server = setupServer(...defaultHandlers);
