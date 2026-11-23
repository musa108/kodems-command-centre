import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog, DataTable, EmptyState, FormDialog, Pagination, SeverityBadge, StatusBadge } from '@/components/ui';

describe('badges never rely on colour alone', () => {
  it('severity badge shows text', () => { render(<SeverityBadge severity="CRITICAL" />); expect(screen.getByText('Critical')).toBeTruthy(); });
  it('status badge shows humanised text', () => { render(<StatusBadge status="RESPONSE_ACTIVE" />); expect(screen.getByText('Response active')).toBeTruthy(); });
});
describe('DataTable', () => {
  const cols = [{ key: 'a', header: 'Name', render: (r: any) => r.name, sort: 'name' }];
  it('shows skeletons while loading, empty state when none, error with retry', () => {
    const { rerender, container } = render(<DataTable cols={cols} loading rows={[]} />); expect(container.querySelectorAll('tbody tr').length).toBe(6);
    rerender(<DataTable cols={cols} rows={[]} />); expect(screen.getByText('Nothing to show')).toBeTruthy();
    const retry = vi.fn(); rerender(<DataTable cols={cols} error={new Error('boom')} retry={retry} />); fireEvent.click(screen.getByText('Retry')); expect(retry).toHaveBeenCalled(); expect(screen.getByRole('alert').textContent).toContain('boom');
  });
  it('sorts via header buttons and opens rows by keyboard', () => {
    const onSort = vi.fn(), onRow = vi.fn(); render(<DataTable cols={cols} rows={[{ id: '1', name: 'Alpha' }]} onSort={onSort} onRow={onRow} sort="name" dir="asc" />);
    fireEvent.click(screen.getByText('Name')); expect(onSort).toHaveBeenCalledWith('name'); fireEvent.keyDown(screen.getByText('Alpha').closest('tr')!, { key: 'Enter' }); expect(onRow).toHaveBeenCalled(); expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
  });
});
describe('Pagination', () => {
  it('disables edges and reports page changes', () => { const on = vi.fn(); render(<Pagination meta={{ total: 45, page: 1, pages: 3, pageSize: 20 }} onPage={on} />); expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true); fireEvent.click(screen.getByLabelText('Next page')); expect(on).toHaveBeenCalledWith(2); expect(screen.getByText('1–20 of 45')).toBeTruthy(); });
  it('renders nothing for empty results', () => { const { container } = render(<Pagination meta={{ total: 0, page: 1, pages: 0, pageSize: 20 }} onPage={() => undefined} />); expect(container.innerHTML).toBe(''); });
});
describe('FormDialog validation', () => {
  it('blocks submit and shows accessible errors for missing mandatory reason', async () => {
    const submit = vi.fn(); render(<FormDialog open onClose={() => undefined} title="Reject report" onSubmit={submit} fields={[{ name: 'reason', label: 'Reason', required: true, minLength: 5 }]} />);
    fireEvent.click(screen.getByText('Save')); await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy()); expect(submit).not.toHaveBeenCalled(); expect(screen.getByLabelText(/Reason/).getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Hoax confirmed by phone' } }); fireEvent.click(screen.getByText('Save')); await waitFor(() => expect(submit).toHaveBeenCalledWith({ reason: 'Hoax confirmed by phone' }));
  });
  it('closes on Escape and exposes dialog semantics', () => { const close = vi.fn(); render(<FormDialog open onClose={close} title="T" onSubmit={() => undefined} fields={[]} />); expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true'); fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalled(); });
});
describe('ConfirmDialog & EmptyState', () => {
  it('confirm calls handler', () => { const ok = vi.fn(); render(<ConfirmDialog open onClose={() => undefined} onConfirm={ok} title="Close" message="Sure?" confirmLabel="Close incident" />); fireEvent.click(screen.getByText('Close incident')); expect(ok).toHaveBeenCalled(); });
  it('empty state', () => { render(<EmptyState title="Queue is clear" hint="Nothing waiting" />); expect(screen.getByText('Queue is clear')).toBeTruthy(); });
});
