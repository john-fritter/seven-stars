import { parentPort, workerData } from 'node:worker_threads';
import { runJobInline, type Job } from './pool.js';

parentPort!.postMessage(runJobInline(workerData as Job));
