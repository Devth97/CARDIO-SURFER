import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useAuth } from './useAuth';

const { onAuthStateChangedMock, signInWithPopupMock, signOutMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
  signInWithPopupMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithPopup: signInWithPopupMock,
  signOut: signOutMock,
}));

vi.mock('./config', () => ({ auth: {} }));

describe('useAuth', () => {
  beforeEach(() => {
    onAuthStateChangedMock.mockReset();
    signInWithPopupMock.mockReset();
    signOutMock.mockReset();
  });

  it('starts loading and reflects a signed-out user once Firebase reports null', async () => {
    let capturedCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth: unknown, callback: (u: User | null) => void) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    act(() => {
      capturedCallback(null);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('reflects a signed-in user once Firebase reports one', async () => {
    const fakeUser = { uid: 'user-1', displayName: 'Ada' } as User;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, callback: (u: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(fakeUser);
  });

  it('signIn calls Firebase signInWithPopup and returns the signed-in user', async () => {
    onAuthStateChangedMock.mockImplementation(() => () => {});
    const fakeUser = { uid: 'user-1' } as User;
    signInWithPopupMock.mockResolvedValue({ user: fakeUser });

    const { result } = renderHook(() => useAuth());

    let returnedUser: User | undefined;
    await act(async () => {
      returnedUser = await result.current.signIn();
    });

    expect(signInWithPopupMock).toHaveBeenCalledTimes(1);
    expect(returnedUser).toEqual(fakeUser);
  });

  it('signOut calls Firebase signOut', async () => {
    onAuthStateChangedMock.mockImplementation(() => () => {});
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
