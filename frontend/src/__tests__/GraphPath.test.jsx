import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphPath from '../components/GraphPath';

const NODES = [
  { id: 'a/Alice', label: 'Alice Smith' },
  { id: 'b/Bob', label: 'Bob Jones' },
  { id: 'c/Charlie', label: 'Charlie Brown' },
];
const EDGES = [
  { id: 'ab', source: 'a/Alice', target: 'b/Bob' },
  { id: 'bc', source: 'b/Bob', target: 'c/Charlie' },
];

describe('GraphPath', () => {
  it('renders two search inputs and the find button', () => {
    render(<GraphPath nodes={NODES} edges={EDGES} onPathFound={() => {}} />);
    const inputs = screen.getAllByPlaceholderText('Search in graph…');
    expect(inputs).toHaveLength(2);
    expect(screen.getByRole('button', { name: /find shortest path/i })).toBeInTheDocument();
  });

  it('disables the button when no nodes are selected', () => {
    render(<GraphPath nodes={NODES} edges={EDGES} onPathFound={() => {}} />);
    expect(screen.getByRole('button', { name: /find shortest path/i })).toBeDisabled();
  });

  it('filters suggestions as user types', async () => {
    render(<GraphPath nodes={NODES} edges={EDGES} onPathFound={() => {}} />);
    const [input1] = screen.getAllByPlaceholderText('Search in graph…');
    await userEvent.type(input1, 'Alice');
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('finds a path and calls onPathFound with the node IDs', async () => {
    const onPathFound = vi.fn();
    render(<GraphPath nodes={NODES} edges={EDGES} onPathFound={onPathFound} />);
    const [input1, input2] = screen.getAllByPlaceholderText('Search in graph…');

    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getByText('Alice Smith'));

    await userEvent.type(input2, 'Charlie');
    await userEvent.click(screen.getByText('Charlie Brown'));

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(onPathFound).toHaveBeenCalledWith(['a/Alice', 'b/Bob', 'c/Charlie']);
    expect(screen.getByText(/2 degrees/i)).toBeInTheDocument();
  });

  it('shows error when same node is selected twice', async () => {
    render(<GraphPath nodes={NODES} edges={EDGES} onPathFound={() => {}} />);
    const [input1, input2] = screen.getAllByPlaceholderText('Search in graph…');

    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getAllByText('Alice Smith')[0]);

    await userEvent.type(input2, 'Alice');
    // Two "Alice Smith" texts exist: the badge from slot 1 and the dropdown result in slot 2
    const aliceOptions = screen.getAllByText('Alice Smith');
    await userEvent.click(aliceOptions[aliceOptions.length - 1]);

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(screen.getByText(/same person/i)).toBeInTheDocument();
  });

  it('shows error when no path exists in the loaded graph', async () => {
    const isolatedNodes = [
      ...NODES,
      { id: 'd/Dave', label: 'Dave Isolated' },
    ];
    const onPathFound = vi.fn();
    render(<GraphPath nodes={isolatedNodes} edges={EDGES} onPathFound={onPathFound} />);
    const [input1, input2] = screen.getAllByPlaceholderText('Search in graph…');

    await userEvent.type(input1, 'Alice');
    await userEvent.click(screen.getAllByText('Alice Smith')[0]);

    await userEvent.type(input2, 'Dave');
    await userEvent.click(screen.getByText('Dave Isolated'));

    await userEvent.click(screen.getByRole('button', { name: /find shortest path/i }));
    expect(screen.getByText(/no path found/i)).toBeInTheDocument();
    expect(onPathFound).toHaveBeenCalledWith(null);
  });
});
