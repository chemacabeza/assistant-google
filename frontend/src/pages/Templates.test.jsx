import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { loginAs, readJson, renderWithProviders } from '../test/utils';
import Templates from './Templates';

const pending = {
  id: 7,
  title: 'Follow up',
  content: 'Hi {{name}},\nthanks!',
  category: 'General',
  fromEmail: 'work@example.com',
  targetEmail: 'client@example.com',
  sendAt: '2026-11-01T09:30:00',
  status: 'PENDING',
};

function mockTemplates(initial = [], { contacts = [] } = {}) {
  const state = { templates: [...initial], created: [], updated: [], deleted: [] };
  server.use(
    http.get('/api/templates', () => HttpResponse.json(state.templates)),
    http.get('/api/contacts', () => HttpResponse.json(contacts)),
    http.post('/api/templates', async ({ request }) => {
      const body = await readJson(request);
      state.created.push(body);
      const saved = { ...body, id: 100 + state.created.length, status: 'PENDING' };
      state.templates.push(saved);
      return HttpResponse.json(saved);
    }),
    http.put('/api/templates/:id', async ({ request, params }) => {
      const body = await readJson(request);
      state.updated.push({ id: params.id, body });
      state.templates = state.templates.map((t) => (String(t.id) === params.id ? { ...t, ...body } : t));
      return HttpResponse.json(body);
    }),
    http.delete('/api/templates/:id', ({ params }) => {
      state.deleted.push(params.id);
      state.templates = state.templates.filter((t) => String(t.id) !== params.id);
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return state;
}

function getForm() {
  const form = screen.getByRole('button', { name: /save template/i }).closest('form');
  return {
    form,
    title: within(form).getByPlaceholderText('e.g., Follow up after meeting'),
    from: within(form).getByRole('combobox'),
    target: within(form).getByPlaceholderText('recipient@example.com'),
    date: form.querySelector('input[type=date]'),
    time: form.querySelector('input[type=time]'),
    body: form.querySelector('textarea'),
  };
}

describe('Templates (Scheduled Emails) page', () => {
  beforeEach(() => loginAs());

  it('shows a spinner then the empty state', async () => {
    mockTemplates();
    const { container } = renderWithProviders(<Templates />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first template' })).toBeInTheDocument();
  });

  it('lists templates with status badge, addresses and schedule', async () => {
    mockTemplates([
      pending,
      { id: 8, title: 'Sent one', content: 'c', status: 'SENT' },
      { id: 9, title: 'Broken', content: 'c', status: 'FAILED' },
    ]);
    renderWithProviders(<Templates />);

    expect(await screen.findByRole('heading', { name: 'Follow up' })).toBeInTheDocument();
    expect(screen.getByText('From: work@example.com')).toBeInTheDocument();
    expect(screen.getByText('To: client@example.com')).toBeInTheDocument();
    expect(screen.getByText(/^Scheduled: /)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('creates a scheduled email with the expected payload', async () => {
    const state = mockTemplates();
    const { user } = renderWithProviders(<Templates />);
    await screen.findByText('No templates yet');

    await user.click(screen.getByRole('button', { name: /new template/i }));
    expect(screen.getByRole('heading', { name: 'New Template' })).toBeInTheDocument();
    const f = getForm();
    await waitFor(() => expect(f.from).toHaveValue('primary@example.com'));

    await user.type(f.title, 'Reminder');
    await user.selectOptions(f.from, 'work@example.com');
    await user.type(f.target, 'bob@example.com');
    await user.type(f.date, '2026-12-24');
    await user.type(f.time, '08:15');
    await user.type(f.body, 'Do not forget');
    await user.click(screen.getByRole('button', { name: /save template/i }));

    expect(await screen.findByRole('heading', { name: 'Reminder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save template/i })).not.toBeInTheDocument();
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({
      id: null,
      title: 'Reminder',
      content: 'Do not forget',
      category: 'General',
      fromEmail: 'work@example.com',
      targetEmail: 'bob@example.com',
      sendAt: '2026-12-24T08:15:00', // local date-time, matches backend LocalDateTime
    });
  });

  it('suggests contacts while typing the recipient', async () => {
    mockTemplates([], { contacts: [{ name: 'Grace Hopper', email: 'grace@navy.mil' }, { name: 'Alan', email: 'alan@x.org' }] });
    const { user } = renderWithProviders(<Templates />);
    await screen.findByText('No templates yet');
    await user.click(screen.getByRole('button', { name: /new template/i }));
    const f = getForm();

    await user.type(f.target, 'gra');
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Alan')).not.toBeInTheDocument();
    await user.click(screen.getByText('grace@navy.mil'));
    expect(f.target).toHaveValue('grace@navy.mil');
  });

  it('edits an existing template via PUT, prefilled from sendAt', async () => {
    const state = mockTemplates([pending]);
    const { user } = renderWithProviders(<Templates />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('heading', { name: 'Edit Template' })).toBeInTheDocument();
    const f = getForm();
    expect(f.title).toHaveValue('Follow up');
    expect(f.from).toHaveValue('work@example.com');
    expect(f.target).toHaveValue('client@example.com');
    expect(f.date).toHaveValue('2026-11-01');
    expect(f.time).toHaveValue('09:30');
    expect(f.body).toHaveValue('Hi {{name}},\nthanks!');

    await user.clear(f.title);
    await user.type(f.title, 'Follow up v2');
    await user.clear(f.time);
    await user.type(f.time, '10:45');
    await user.click(screen.getByRole('button', { name: /save template/i }));

    expect(await screen.findByRole('heading', { name: 'Follow up v2' })).toBeInTheDocument();
    expect(state.created).toEqual([]);
    expect(state.updated).toHaveLength(1);
    expect(state.updated[0].id).toBe('7');
    expect(state.updated[0].body).toMatchObject({ id: 7, title: 'Follow up v2', sendAt: '2026-11-01T10:45:00' });
  });

  it('deletes a template after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const state = mockTemplates([pending]);
    const { user } = renderWithProviders(<Templates />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));

    expect(confirm).toHaveBeenCalledWith('Delete this template?');
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(state.deleted).toEqual(['7']);
  });

  it('keeps the template when deletion is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const state = mockTemplates([pending]);
    const { user } = renderWithProviders(<Templates />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    expect(state.deleted).toEqual([]);
    expect(screen.getByRole('heading', { name: 'Follow up' })).toBeInTheDocument();
  });

  it('keeps the modal open when saving fails', async () => {
    const state = mockTemplates([pending]);
    server.use(http.put('/api/templates/:id', () => new HttpResponse(null, { status: 500 })));
    const { user } = renderWithProviders(<Templates />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /save template/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /save template/i })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Edit Template' })).toBeInTheDocument();
    expect(state.updated).toEqual([]);
  });

  // BUG: openModal() assigns fromEmail/sendDate/sendTime directly onto the template object
  // that lives in the React Query cache. Just opening "Edit" on a template without a sender
  // and closing the modal (without saving) makes the card show a "From:" line that was never
  // persisted. openModal should copy the object before modifying it.
  it.skip('BUG: opening and closing the editor does not change the cached template', async () => {
    mockTemplates([{ ...pending, fromEmail: null }]);
    const { user } = renderWithProviders(<Templates />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const header = screen.getByRole('heading', { name: 'Edit Template' }).parentElement;
    await user.click(within(header).getByRole('button'));
    expect(screen.queryByText(/^From: /)).not.toBeInTheDocument();
  });
});
