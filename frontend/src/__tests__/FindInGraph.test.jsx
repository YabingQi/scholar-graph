import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindInGraph from '../components/FindInGraph';

const NODES = [
  { id: 'a/Alice', label: 'Alice Smith', affiliation: 'MIT' },
  { id: 'b/Bob', label: 'Bob Jones', affiliation: 'Stanford' },
  { id: 'c/Charlie', label: 'Charlie Brown', affiliation: '' },
];

describe('FindInGraph', () => {
  it('renders the search input', () => {
    render(<FindInGraph nodes={[]} onFocus={() => {}} />);
    expect(screen.getByPlaceholderText('Find in graph…')).toBeInTheDocument();
  });

  it('shows no results when input is empty', () => {
    render(<FindInGraph nodes={NODES} onFocus={() => {}} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('filters nodes by label (case-insensitive)', async () => {
    render(<FindInGraph nodes={NODES} onFocus={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Find in graph…'), 'alice');
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('shows "Not in graph" when no nodes match', async () => {
    render(<FindInGraph nodes={NODES} onFocus={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Find in graph…'), 'zzznotfound');
    expect(screen.getByText('Not in graph')).toBeInTheDocument();
  });

  it('calls onFocus with the node and clears input on click', async () => {
    const onFocus = vi.fn();
    render(<FindInGraph nodes={NODES} onFocus={onFocus} />);
    await userEvent.type(screen.getByPlaceholderText('Find in graph…'), 'Bob');
    await userEvent.click(screen.getByText('Bob Jones'));
    expect(onFocus).toHaveBeenCalledWith(NODES[1]);
    expect(screen.getByPlaceholderText('Find in graph…')).toHaveValue('');
  });

  it('shows affiliation when present', async () => {
    render(<FindInGraph nodes={NODES} onFocus={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Find in graph…'), 'Alice');
    expect(screen.getByText('MIT')).toBeInTheDocument();
  });
});
