import { describe, expect, it } from 'vitest';
import { AdminAccessTracker } from './adminAccessTracker';

describe('AdminAccessTracker', () => {
  it('resets the admin flag when a different user takes over the tab', () => {
    const tracker = new AdminAccessTracker();
    expect(tracker.setUser('admin-a')).toEqual({ isMember: false, adminCheckFailed: false });
    expect(tracker.succeed(tracker.begin()!, true)).toEqual({ isMember: true, adminCheckFailed: false });

    expect(tracker.setUser('admin-a')).toBeNull();
    expect(tracker.setUser('user-b')).toEqual({ isMember: false, adminCheckFailed: false });
  });

  it("ignores a slow lookup for the previous user (admin A's answer never applies to B)", () => {
    const tracker = new AdminAccessTracker();
    tracker.setUser('admin-a');
    const slowLookupForA = tracker.begin()!;
    tracker.setUser('user-b');

    expect(tracker.succeed(slowLookupForA, true)).toBeNull();
    expect(tracker.fail(slowLookupForA)).toBeNull();
  });

  it('ignores a lookup started before the same user signed out and back in', () => {
    const tracker = new AdminAccessTracker();
    tracker.setUser('admin-a');
    const beforeSignOut = tracker.begin()!;
    tracker.setUser(null);
    tracker.setUser('admin-a');
    expect(tracker.succeed(beforeSignOut, true)).toBeNull();
  });

  it('reports "could not verify" when the first lookup for a user fails', () => {
    const tracker = new AdminAccessTracker();
    tracker.setUser('admin-a');
    expect(tracker.fail(tracker.begin()!)).toEqual({ adminCheckFailed: true });
  });

  it('keeps a verified admin signed in through a transient lookup failure', () => {
    const tracker = new AdminAccessTracker();
    tracker.setUser('admin-a');
    tracker.succeed(tracker.begin()!, true);
    expect(tracker.fail(tracker.begin()!)).toBeNull();
  });

  it('starts no lookup when nobody is signed in', () => {
    const tracker = new AdminAccessTracker();
    expect(tracker.begin()).toBeNull();
    tracker.setUser('admin-a');
    tracker.setUser(null);
    expect(tracker.begin()).toBeNull();
  });
});
