export class SequentialQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  enqueue(job: () => Promise<void>): void {
    this.pending += 1;
    this.tail = this.tail
      .then(job, job)
      .catch(() => undefined)
      .finally(() => {
        this.pending -= 1;
      });
  }

  get size(): number {
    return this.pending;
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
