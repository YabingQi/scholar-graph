import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from '../components/SearchBar';
import * as client from '../api/client';

vi.mock('../api/client');

const AUTHOR = { authorId: 'x/Test', name: 'Test Author', affiliations: ['MIT'] };

beforeEach(() => vi.resetAllMocks());

describe('SearchBar', () => {
  it('renders input and search button', () => {
    render(<SearchBar onSelect={() => {}} />);
    expect(screen.getByPlaceholderText('Researcher name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('shows results after a successful search', async () => {
    client.searchAuthors.mockResolvedValue({ results: [AUTHOR] });
    render(<SearchBar onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Researcher name'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Test Author')).toBeInTheDocument();
  });

  it('calls onSelect with the author when a result is clicked', async () => {
    client.searchAuthors.mockResolvedValue({ results: [AUTHOR] });
    const onSelect = vi.fn();
    render(<SearchBar onSelect={onSelect} />);

    await userEvent.type(screen.getByPlaceholderText('Researcher name'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByText('Test Author'));

    expect(onSelect).toHaveBeenCalledWith(AUTHOR);
  });

  it('clears input and results after selection', async () => {
    client.searchAuthors.mockResolvedValue({ results: [AUTHOR] });
    render(<SearchBar onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Researcher name'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByText('Test Author'));

    expect(screen.getByPlaceholderText('Researcher name')).toHaveValue('');
    expect(screen.queryByText('Test Author')).not.toBeInTheDocument();
  });

  it('shows an error message when search fails', async () => {
    client.searchAuthors.mockRejectedValue(new Error('Network error'));
    render(<SearchBar onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Researcher name'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(/failed/i)).toBeInTheDocument();
  });

  it('shows "no authors found" when results are empty', async () => {
    client.searchAuthors.mockResolvedValue({ results: [] });
    render(<SearchBar onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Researcher name'), 'Nobody');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(/no authors found/i)).toBeInTheDocument();
  });
});
