import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PathFinder from '../components/PathFinder';
import * as client from '../api/client';

vi.mock('../api/client');

const AUTHOR_A = { authorId: 'a/Alice', name: 'Alice Smith', affiliations: ['MIT'] };
const AUTHOR_B = { authorId: 'b/Bob', name: 'Bob Jones', affiliations: ['Stanford'] };

beforeEach(() => vi.resetAllMocks());

describe('PathFinder', () => {
  it('renders two search bars and the find button', () => {
    render(<PathFinder onFindPath={() => {}} loading={false} />);
    const inputs = screen.getAllByPlaceholderText('Researcher name');
    expect(inputs).toHaveLength(2);
    expect(screen.getByRole('button', { name: /find shortest path/i })).toBeInTheDocument();
  });

  it('disables the button when no authors are selected', () => {
    render(<PathFinder onFindPath={() => {}} loading={false} />);
    expect(screen.getByRole('button', { name: /find shortest path/i })).toBeDisabled();
  });

  it('disables the button while loading', async () => {
    client.searchAuthors.mockResolvedValue({ results: [AUTHOR_A] });
    render(<PathFinder onFindPath={() => {}} loading={true} />);
    expect(screen.getByRole('button', { name: /searching/i })).toBeDisabled();
  });

  it('calls onFindPath when both authors are selected', async () => {
    client.searchAuthors
      .mockResolvedValueOnce({ results: [AUTHOR_A] })
      .mockResolvedValueOnce({ results: [AUTHOR_B] });
    const onFindPath = vi.fn().mockResolvedValue(undefined);
    render(<PathFinder onFindPath={onFindPath} loading={false} />);

    const [input1, input2] = screen.getAllByPlaceholderText('Researcher name');

    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]);
    await userEvent.click(await screen.findByText('Alice Smith'));

    await userEvent.type(input2, 'Bob');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[1]);
    await userEvent.click(await screen.findByText('Bob Jones'));

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(onFindPath).toHaveBeenCalledWith(AUTHOR_A, AUTHOR_B, expect.any(Function));
  });

  it('shows degree count when path is found', async () => {
    client.searchAuthors
      .mockResolvedValueOnce({ results: [AUTHOR_A] })
      .mockResolvedValueOnce({ results: [AUTHOR_B] });
    const onFindPath = vi.fn().mockImplementation(async (_a, _b, cb) => {
      cb({ degrees: 2, path: ['a/Alice', 'x/Intermediate', 'b/Bob'], nodes: [] });
    });
    render(<PathFinder onFindPath={onFindPath} loading={false} />);

    const [input1, input2] = screen.getAllByPlaceholderText('Researcher name');
    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]);
    await userEvent.click(await screen.findByText('Alice Smith'));

    await userEvent.type(input2, 'Bob');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[1]);
    await userEvent.click(await screen.findByText('Bob Jones'));

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(await screen.findByText(/2 degrees/i)).toBeInTheDocument();
  });

  it('shows error when no path is found', async () => {
    client.searchAuthors
      .mockResolvedValueOnce({ results: [AUTHOR_A] })
      .mockResolvedValueOnce({ results: [AUTHOR_B] });
    const onFindPath = vi.fn().mockImplementation(async (_a, _b, cb) => cb(null));
    render(<PathFinder onFindPath={onFindPath} loading={false} />);

    const [input1, input2] = screen.getAllByPlaceholderText('Researcher name');
    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]);
    await userEvent.click(await screen.findByText('Alice Smith'));

    await userEvent.type(input2, 'Bob');
    await userEvent.click(screen.getAllByRole('button', { name: 'Search' })[1]);
    await userEvent.click(await screen.findByText('Bob Jones'));

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(await screen.findByText(/no path found/i)).toBeInTheDocument();
  });
});
