// Polling must not apply a response captured before a user mutation or account switch.
export class SurveillanceRequestGuard {
  private revision = 0;
  private readId = 0;
  private writes = 0;
  private accountVersion = 0;

  constructor(private userId: string) {}

  setUser(userId: string) {
    if (this.userId === userId) return;
    this.userId = userId;
    this.revision++;
    this.accountVersion++;
    this.writes = 0;
  }

  isUser(userId: string) { return userId === this.userId; }

  beginRead() {
    if (this.writes) return null;
    return { userId: this.userId, revision: this.revision, readId: ++this.readId };
  }

  canApply(request: NonNullable<ReturnType<SurveillanceRequestGuard['beginRead']>>) {
    return this.isUser(request.userId) && request.revision === this.revision &&
      request.readId === this.readId && this.writes === 0;
  }

  beginWrite(userId: string) {
    const revisionUser = this.userId;
    const accountVersion = this.accountVersion;
    if (userId === revisionUser) { this.writes++; this.revision++; }
    const finish = () => {
      if (userId === revisionUser && this.accountVersion === accountVersion) {
        this.writes = Math.max(0, this.writes - 1);
        this.revision++;
      }
    };
    return Object.assign(finish, { isCurrent: () => userId === this.userId && this.accountVersion === accountVersion });
  }
}
