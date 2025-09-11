import type { Disposable } from "@ccflare/core";
import { Logger } from "@ccflare/logger";

const logger = new Logger("async-db-writer");

type DbJob = () => void | Promise<void>;

export class AsyncDbWriter implements Disposable {
	private queue: DbJob[] = [];
	private running = false;
	private intervalId: Timer | null = null;
	private maxQueueSize: number;
	private warnThreshold: number;

	// Metrics
	public queueDepth = 0;
	public droppedJobs = 0;
	public totalJobs = 0;

	constructor(maxQueueSize = 1000) {
		this.maxQueueSize = maxQueueSize;
		this.warnThreshold = maxQueueSize * 0.8;
		// Process queue every 100ms
		this.intervalId = setInterval(() => void this.processQueue(), 100);
	}

	enqueue(job: DbJob): boolean {
		this.totalJobs++;
		this.queueDepth = this.queue.length;

		if (this.queueDepth >= this.maxQueueSize) {
			this.droppedJobs++;
			logger.error("DB queue overflow. Dropping job.");
			return false; // Signal that the job was dropped
		}

		if (this.queueDepth >= this.warnThreshold) {
			logger.warn(`DB queue approaching capacity. Depth: ${this.queueDepth}`);
		}

		this.queue.push(job);
		// Immediately try to process if not already running
		void this.processQueue();
		return true;
	}

	private async processQueue(): Promise<void> {
		if (this.running || this.queue.length === 0) {
			return;
		}

		this.running = true;

		try {
			while (this.queue.length > 0) {
				const job = this.queue.shift();
				if (!job) continue;
				try {
					await job();
				} catch (error) {
					logger.error("Failed to execute DB job", error);
				}
			}
		} finally {
			this.running = false;
		}
	}

	async dispose(): Promise<void> {
		logger.info("Flushing async DB writer queue...");

		// Stop the interval
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		// Process any remaining jobs
		await this.processQueue();

		logger.info("Async DB writer queue flushed", {
			remainingJobs: this.queue.length,
		});
	}
}
