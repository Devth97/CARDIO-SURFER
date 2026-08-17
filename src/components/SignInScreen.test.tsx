import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignInScreen from './SignInScreen';

describe('SignInScreen', () => {
  it('calls onSignIn when the sign-in button is clicked', () => {
    const onSignIn = vi.fn();
    render(<SignInScreen onSignIn={onSignIn} onBack={() => {}} error={null} loading={false} />);

    fireEvent.click(screen.getByText(/sign in with google/i));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when provided', () => {
    render(
      <SignInScreen
        onSignIn={() => {}}
        onBack={() => {}}
        error="Could not sign in. Please try again."
        loading={false}
      />,
    );
    expect(screen.getByText(/could not sign in/i)).toBeInTheDocument();
  });

  it('disables the button and shows a loading label while signing in', () => {
    render(<SignInScreen onSignIn={() => {}} onBack={() => {}} error={null} loading={true} />);
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('calls onBack when the back link is clicked', () => {
    const onBack = vi.fn();
    render(<SignInScreen onSignIn={() => {}} onBack={onBack} error={null} loading={false} />);
    fireEvent.click(screen.getByText(/back/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
