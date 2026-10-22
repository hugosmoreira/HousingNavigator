/**
 * Bookkeeping that binds admin membership to the user it was verified for.
 *
 * AdminAuthContext runs `admin_users` lookups asynchronously, while auth
 * events can switch the signed-in user at any moment (another tab signs
 * in, sign-out then sign-in). This tracker decides whether a finished
 * lookup still applies, and what a failed lookup means, so the rules can
 * be unit tested without rendering the provider.
 */

export interface AdminAccessSnapshot {
  /** Row in admin_users for this user (MFA is decided separately, see adminAccess.ts). */
  isMember: boolean;
  /** The lookup failed before this user was ever verified: answer unknown. */
  adminCheckFailed: boolean;
}

export interface AdminCheckTicket {
  readonly userId: string;
  readonly generation: number;
}

export class AdminAccessTracker {
  private sessionUserId: string | null = null;
  private verifiedUserId: string | null = null;
  private generation = 0;

  /** The user the current session belongs to. */
  get userId(): string | null {
    return this.sessionUserId;
  }

  /**
   * Record the session's user. Returns the reset snapshot when the user
   * changed (callers must apply it), or null when it is the same user.
   */
  setUser(userId: string | null): AdminAccessSnapshot | null {
    if (userId === this.sessionUserId) return null;
    this.sessionUserId = userId;
    this.verifiedUserId = null;
    this.generation += 1;
    return { isMember: false, adminCheckFailed: false };
  }

  /** Start a lookup for the current user, or null when nobody is signed in. */
  begin(): AdminCheckTicket | null {
    return this.sessionUserId
      ? { userId: this.sessionUserId, generation: this.generation }
      : null;
  }

  private isCurrent(ticket: AdminCheckTicket): boolean {
    return ticket.generation === this.generation && ticket.userId === this.sessionUserId;
  }

  /** A lookup answered. Returns the snapshot to apply, or null if a different user is signed in now. */
  succeed(ticket: AdminCheckTicket, isMember: boolean): AdminAccessSnapshot | null {
    if (!this.isCurrent(ticket)) return null;
    this.verifiedUserId = ticket.userId;
    return { isMember, adminCheckFailed: false };
  }

  /**
   * A lookup failed. A user verified earlier keeps their last answer (null:
   * change nothing). A user never verified gets "could not verify".
   */
  fail(ticket: AdminCheckTicket): Pick<AdminAccessSnapshot, 'adminCheckFailed'> | null {
    if (!this.isCurrent(ticket) || this.verifiedUserId === ticket.userId) return null;
    return { adminCheckFailed: true };
  }
}
