// src/lib/scanner.ts - Parallel Streaming Scanner with Live SignalR Metadata Extraction

import type { ValidClassCode, SendJoinClassPayload } from "../types";
import { generateUsername, generateParticipantId } from "../utils";
import { SCANNER_CONFIG, API_ENDPOINTS, DEFAULT_NAME_PREFIX } from "../config";
import { scannerLogger as logger } from "../logger";
import axios from "axios";
import https from "https";

// Optimized HTTPS agent for high-throughput scanning with connection reuse
const scannerAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 500,
  maxFreeSockets: 256,
  timeout: 30000,
  scheduling: "lifo",
  family: 4,
});

// Dedicated axios instance for scanner with optimized settings
const scannerClient = axios.create({
  httpsAgent: scannerAgent,
  timeout: 8000,
  validateStatus: () => true,
  headers: {
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
  },
});

// Pre-flight check state
let preFlightDone = false;
let preFlightSuccess = false;
let adaptiveTimeout = SCANNER_CONFIG.DISCOVERY_TIMEOUT;

// ============================================================================
// Types
// ============================================================================

interface Candidate {
  code: number;
  presenterEmail: string;
  cpcsRegion: string;
  school?: string;
  teacherName?: string;
}

interface ValidationResult {
  isValid: boolean;
  school?: string;
  teacherName?: string;
}

interface SessionScannerState {
  scanning: boolean;
  shouldStop: boolean;
  foundCodes: ValidClassCode[];
  startTime: number | null;
  currentCode: number | null;
  scannedCount: number;
  lastHeartbeat: number;
  remainingCodes: number[];
  originalRange: { start: number; end: number };
  scanMode: "new" | "resume" | null;
  interruptedAt: number | null;
  totalCodes: number;
  candidateCount: number;
  validatedCount: number;
  validationActive: boolean;
}

// ============================================================================
// Session Management
// ============================================================================

const globalWithScanner = global as typeof globalThis & {
  _scannerSessions?: Map<string, SessionScannerState>;
};

if (!globalWithScanner._scannerSessions) {
  globalWithScanner._scannerSessions = new Map<string, SessionScannerState>();
}

const sessions = globalWithScanner._scannerSessions;

const SCAN_HEARTBEAT_TIMEOUT = 15_000;
const SESSION_CLEANUP_TIMEOUT = 5 * 60_000;
const MAX_SESSIONS = 100;

function createEmptySession(): SessionScannerState {
  return {
    scanning: false,
    shouldStop: false,
    foundCodes: [],
    startTime: null,
    currentCode: null,
    scannedCount: 0,
    lastHeartbeat: Date.now(),
    remainingCodes: [],
    originalRange: { start: SCANNER_CONFIG.START_CODE, end: SCANNER_CONFIG.END_CODE },
    scanMode: null,
    interruptedAt: null,
    totalCodes: 0,
    candidateCount: 0,
    validatedCount: 0,
    validationActive: false,
  };
}

function getOrCreateSession(sessionId: string): SessionScannerState {
  let session = sessions.get(sessionId);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      cleanupStaleSessions();
      if (sessions.size >= MAX_SESSIONS) {
        throw new Error("Maximum concurrent sessions reached.");
      }
    }
    session = createEmptySession();
    sessions.set(sessionId, session);
  }
  session.lastHeartbeat = Date.now();
  return session;
}

function getSession(sessionId: string): SessionScannerState | undefined {
  return sessions.get(sessionId);
}

function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const timeSinceHeartbeat = now - session.lastHeartbeat;
    if (session.scanning && timeSinceHeartbeat > SCAN_HEARTBEAT_TIMEOUT) {
      session.shouldStop = true;
      session.interruptedAt = Date.now();
      console.log(`[Scanner] Session ${id.substring(0, 8)}... auto-stopped: no heartbeat`);
    } else if (!session.scanning && timeSinceHeartbeat > SESSION_CLEANUP_TIMEOUT) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanupStaleSessions, 5000);

// ============================================================================
// Public API
// ============================================================================

export function updateHeartbeat(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) session.lastHeartbeat = Date.now();
}

export function getFoundCodes(sessionId: string): ValidClassCode[] {
  const session = getSession(sessionId);
  return session ? [...session.foundCodes] : [];
}

export function clearFoundCodes(sessionId: string): void {
  const session = getSession(sessionId);
  if (session) {
    session.foundCodes = [];
    session.remainingCodes = [];
    session.candidateCount = 0;
    session.validatedCount = 0;
    session.scanMode = null;
    session.interruptedAt = null;
  }
}

export function isScanning(sessionId: string): boolean {
  return getSession(sessionId)?.scanning ?? false;
}

// ============================================================================
// Pre-flight Check
// ============================================================================

async function runPreFlightCheck(): Promise<boolean> {
  if (preFlightDone) return preFlightSuccess;

  logger.warn("[Pre-flight] Starting connectivity check...");
  const start = Date.now();

  try {
    const res1 = await scannerClient.get(API_ENDPOINTS.CLASS_CODE_LOOKUP(10000));
    const preFlightLatency = Date.now() - start;
    logger.warn(`[Pre-flight] Single request: ${res1.status} (${preFlightLatency}ms)`);

    const calculatedTimeout = Math.min(preFlightLatency * 1.5, 8000);
    adaptiveTimeout = Math.max(SCANNER_CONFIG.DISCOVERY_TIMEOUT, calculatedTimeout);

    if (res1.status === 403 || res1.status === 429) {
      logger.error("[Pre-flight] CRITICAL: Server appears to be BLOCKED or Rate Limited (403/429)");
      preFlightDone = true;
      preFlightSuccess = false;
      return false;
    }

    const burstPromises = [10001, 10002, 10003, 10004, 10005].map((c) =>
      scannerClient
        .get(API_ENDPOINTS.CLASS_CODE_LOOKUP(c))
        .then((r) => r.status)
        .catch(() => "ERR")
    );

    const results = await Promise.all(burstPromises);
    if (results.every((r) => r === "ERR")) {
      logger.error("[Pre-flight] CRITICAL: All burst requests failed.");
      preFlightDone = true;
      preFlightSuccess = false;
      return false;
    }

    preFlightDone = true;
    preFlightSuccess = true;
    return true;
  } catch (error) {
    logger.error(`[Pre-flight] Check FAILED: ${error instanceof Error ? error.message : String(error)}`);
    preFlightDone = true;
    preFlightSuccess = false;
    return false;
  }
}

export function getScanProgress(sessionId: string) {
  const session = getSession(sessionId);
  if (!session) {
    return {
      isScanning: false,
      currentCode: null,
      scannedCount: 0,
      foundCount: 0,
      elapsedMs: null,
      totalCodes: 0,
      remainingCodes: 0,
      canResume: false,
      scanMode: null,
      phase: null,
      candidateCount: 0,
      validatedCount: 0,
      quickScan: false,
    };
  }

  let phase: "discovery" | "validation" | "complete" | null = null;
  if (session.scanning) {
    if (session.scannedCount < session.totalCodes) {
      phase = "discovery";
    } else if (session.validatedCount < session.candidateCount) {
      phase = "validation";
    }
  } else if (session.remainingCodes.length === 0 && session.foundCodes.length > 0) {
    phase = "complete";
  }

  return {
    isScanning: session.scanning,
    currentCode: session.currentCode,
    scannedCount: session.scannedCount,
    foundCount: session.foundCodes.length,
    elapsedMs: session.startTime ? Date.now() - session.startTime : null,
    totalCodes: session.totalCodes,
    remainingCodes: session.remainingCodes.length,
    canResume: !session.scanning && session.remainingCodes.length > 0,
    scanMode: session.scanMode,
    phase,
    candidateCount: session.candidateCount,
    validatedCount: session.validatedCount,
    quickScan: false,
  };
}

export function stopScan(sessionId: string): { stopped: boolean; error?: string } {
  const session = getSession(sessionId);
  if (!session) return { stopped: false, error: "Session not found." };
  if (!session.scanning) return { stopped: false, error: "No scan running." };

  session.shouldStop = true;
  session.interruptedAt = Date.now();
  logger.info(`Session ${sessionId.substring(0, 8)}... stop signal sent.`);
  return { stopped: true };
}

export function cleanupSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.shouldStop = true;
    sessions.delete(sessionId);
  }
}

export function getActiveSessionCount(): number {
  return sessions.size;
}

export function getScanningSessionCount(): number {
  let count = 0;
  for (const s of sessions.values()) if (s.scanning) count++;
  return count;
}

export function disposeScanner(): void {
  for (const session of sessions.values()) session.shouldStop = true;
  sessions.clear();
}

// ============================================================================
// Worker Pool
// ============================================================================

class WorkerPool<T> {
  private queue: T[] = [];
  private queueHead = 0;
  private activeCount = 0;
  private readonly concurrency: number;
  private readonly processor: (item: T) => Promise<void>;
  private drainResolver: (() => void) | null = null;
  private stopped = false;

  constructor(concurrency: number, processor: (item: T) => Promise<void>) {
    this.concurrency = concurrency;
    this.processor = processor;
  }

  push(item: T): void {
    if (this.stopped) return;
    this.queue.push(item);
    this.tryProcess();
  }

  pushMany(items: T[]): void {
    if (this.stopped) return;
    const wasEmpty = this.queueHead >= this.queue.length;
    this.queue.push(...items);

    if (wasEmpty) {
      const workersToStart = Math.min(this.concurrency - this.activeCount, items.length);
      for (let i = 0; i < workersToStart; i++) {
        setImmediate(() => this.tryProcess());
      }
    }
  }

  private async tryProcess(): Promise<void> {
    if (this.stopped || this.activeCount >= this.concurrency || this.queueHead >= this.queue.length) {
      return;
    }

    const item = this.queue[this.queueHead++];
    if (!item) return;

    if (this.queueHead > 1000 && this.queueHead >= this.queue.length) {
      this.queue = [];
      this.queueHead = 0;
    }

    this.activeCount++;
    try {
      await this.processor(item);
    } catch {
      // Errors handled in processor
    } finally {
      this.activeCount--;
      this.tryProcess();
      if (this.activeCount === 0 && this.queueHead >= this.queue.length && this.drainResolver) {
        this.drainResolver();
        this.drainResolver = null;
      }
    }
  }

  async drain(): Promise<void> {
    if (this.activeCount === 0 && this.queueHead >= this.queue.length) return;
    return new Promise((resolve) => {
      this.drainResolver = resolve;
    });
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.queueHead = 0;
  }

  get pending(): number {
    return Math.max(0, this.queue.length - this.queueHead);
  }

  get active(): number {
    return this.activeCount;
  }
}

// ============================================================================
// Discovery - Fast HTTP Lookup
// ============================================================================

let discoveryStats = {
  total: 0,
  ok: 0,
  notFound: 0,
  otherStatus: 0,
  timeout: 0,
  networkError: 0,
  invalidData: 0,
  lastLogTime: Date.now(),
};

async function checkCode(code: number): Promise<Candidate | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout + 500);

  discoveryStats.total++;

  try {
    const response = await scannerClient.get(API_ENDPOINTS.CLASS_CODE_LOOKUP(code), {
      signal: controller.signal,
    });

    if (response.status !== 200) {
      if (response.status === 404) discoveryStats.notFound++;
      else discoveryStats.otherStatus++;
      return null;
    }

    discoveryStats.ok++;
    const data = response.data;

    if (data.presenterEmail && data.cpcsRegion) {
      return {
        code,
        presenterEmail: data.presenterEmail,
        cpcsRegion: data.cpcsRegion,
        school: data.schoolName || data.school || data.organization || undefined,
        teacherName: data.presenterName || data.teacherName || undefined,
      };
    }
    discoveryStats.invalidData++;
  } catch {
    discoveryStats.networkError++;
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

export function getDiscoveryStats() {
  return { ...discoveryStats };
}

export function resetDiscoveryStats() {
  discoveryStats = {
    total: 0,
    ok: 0,
    notFound: 0,
    otherStatus: 0,
    timeout: 0,
    networkError: 0,
    invalidData: 0,
    lastLogTime: Date.now(),
  };
}

// ============================================================================
// Validation & Live Metadata Harvesting (SignalR WebSocket Join)
// ============================================================================

async function validateCandidate(candidate: Candidate): Promise<ValidationResult> {
  const { HubConnectionBuilder, LogLevel, HttpTransportType } = await import("@microsoft/signalr");

  const url = API_ENDPOINTS.WEBSOCKET_URL(candidate.cpcsRegion);
  const username = generateUsername(DEFAULT_NAME_PREFIX);
  const participantId = generateParticipantId();

  const validateUrl = API_ENDPOINTS.VALIDATE_JOIN_URL(
    candidate.cpcsRegion,
    candidate.presenterEmail,
    candidate.code.toString(),
    participantId,
    username
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

    const validateResponse = await fetch(validateUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
      keepalive: true,
    });

    clearTimeout(timeoutId);

    if (!validateResponse.ok) return { isValid: false };
  } catch {
    return { isValid: false };
  }

  let connection: ReturnType<typeof HubConnectionBuilder.prototype.build> | null = null;

  try {
    connection = new HubConnectionBuilder()
      .withUrl(url, { transport: HttpTransportType.WebSockets, withCredentials: true })
      .configureLogging(LogLevel.None)
      .build();

    let resolved = false;

    const resultPromise = new Promise<ValidationResult>((resolve) => {
      connection!.on("SendJoinClass", (data: SendJoinClassPayload) => {
        if (!resolved) {
          resolved = true;

          const payload = data as Record<string, unknown>;
          const profile = payload.profile as Record<string, unknown> | undefined;
          const presenterProfile = payload.presenterProfile as Record<string, unknown> | undefined;

          const extractedSchool =
            (payload.schoolName as string) ||
            (payload.school as string) ||
            (payload.institution as string) ||
            (payload.organization as string) ||
            (payload.presenterSchool as string) ||
            (profile?.schoolName as string) ||
            (presenterProfile?.schoolName as string);

          const extractedTeacher =
            (payload.presenterName as string) ||
            (payload.teacherName as string) ||
            (payload.displayName as string) ||
            (payload.hostName as string) ||
            (profile?.displayName as string) ||
            (presenterProfile?.displayName as string);

          const isInSlideshow = payload.isInSlideshow === true;

          resolve({
            isValid: isInSlideshow,
            school: extractedSchool ? String(extractedSchool).trim() : undefined,
            teacherName: extractedTeacher ? String(extractedTeacher).trim() : undefined,
          });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ isValid: false });
        }
      }, SCANNER_CONFIG.VALIDATION_TIMEOUT);
    });

    await connection.start();
    await connection.send("Send", { protocol: "json", version: 1 });
    await connection.send("ParticipantStartup", {
      participantUsername: username,
      participantName: username,
      participantId,
      participantAvatar: "",
      cpcsRegion: candidate.cpcsRegion,
      presenterEmail: candidate.presenterEmail,
      classSessionId: "",
    });

    return await resultPromise;
  } catch {
    return { isValid: false };
  } finally {
    if (connection) {
      try {
        await connection.stop();
      } catch {
        /* ignore connection close errors */
      }
    }
  }
}

// ============================================================================
// Utility
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// ============================================================================
// Main Scanner Execution Loop
// ============================================================================

export async function startScanIfNotRunning(
  sessionId: string,
  start: number = SCANNER_CONFIG.START_CODE,
  end: number = SCANNER_CONFIG.END_CODE,
  options: { resume?: boolean } = {}
): Promise<{ started: boolean; error?: string }> {
  const isHealthy = await runPreFlightCheck();
  if (!isHealthy) {
    return {
      started: false,
      error: "Network check FAILED. Server appears blocked or has no connectivity.",
    };
  }

  const session = getOrCreateSession(sessionId);

  if (session.scanning) {
    return { started: false, error: "Scan already in progress." };
  }

  if (start > end || start < SCANNER_CONFIG.START_CODE || end > SCANNER_CONFIG.END_CODE) {
    return { started: false, error: "Invalid code range." };
  }

  let codesToScan: number[];

  if (options.resume && session.remainingCodes.length > 0) {
    codesToScan = session.remainingCodes;
    session.scanMode = "resume";
  } else {
    const allCodes: number[] = [];
    for (let code = start; code <= end; code++) allCodes.push(code);
    codesToScan = shuffleArray(allCodes);
    session.foundCodes = [];
    session.candidateCount = 0;
    session.validatedCount = 0;
    session.scanMode = "new";
    session.originalRange = { start, end };
    session.totalCodes = allCodes.length;
  }

  session.scanning = true;
  session.shouldStop = false;
  session.startTime = Date.now();
  session.scannedCount = session.scanMode === "resume" ? session.totalCodes - codesToScan.length : 0;
  session.currentCode = codesToScan[0] || null;
  session.remainingCodes = [...codesToScan];
  session.interruptedAt = null;

  (async () => {
    try {
      const validationPool = new WorkerPool<Candidate>(
        SCANNER_CONFIG.VALIDATION_CONCURRENCY,
        async (candidate) => {
          if (session.shouldStop) return;

          const validation = await validateCandidate(candidate);
          session.validatedCount++;

          if (validation.isValid) {
            const finalSchool = validation.school || candidate.school;
            const finalTeacher = validation.teacherName || candidate.teacherName;

            session.foundCodes.push({
              code: candidate.code,
              email: candidate.presenterEmail,
              school: finalSchool,
              teacherName: finalTeacher,
              foundAt: new Date(),
            } as ValidClassCode);

            logger.info(
              `✓ Confirmed Active Class: ${candidate.code} (${finalTeacher || "Unknown Host"} @ ${
                finalSchool || candidate.presenterEmail
              })`
            );
          }
        }
      );

      const discoveryPool = new WorkerPool<number>(
        SCANNER_CONFIG.DISCOVERY_CONCURRENCY,
        async (code) => {
          if (session.shouldStop) return;

          session.currentCode = code;
          session.scannedCount++;

          const idx = session.remainingCodes.indexOf(code);
          if (idx > -1) session.remainingCodes.splice(idx, 1);

          const candidate = await checkCode(code);

          if (candidate) {
            if (
              SCANNER_CONFIG.COLLECT_ONLY_DOMAIN &&
              !candidate.presenterEmail.includes(SCANNER_CONFIG.COLLECT_ONLY_DOMAIN)
            ) {
              return;
            }

            session.candidateCount++;
            validationPool.push(candidate);
          }
        }
      );

      discoveryPool.pushMany(codesToScan);

      await discoveryPool.drain();
      await validationPool.drain();

      if (!session.shouldStop) {
        session.remainingCodes = [];
      }
    } catch (error) {
      logger.error(`Scan execution error:`, error);
      session.interruptedAt = Date.now();
    } finally {
      session.scanning = false;
      session.startTime = null;
      session.currentCode = null;

      const completed = session.remainingCodes.length === 0;
      logger.info(
        `Session ${sessionId.substring(0, 8)}... scan ${completed ? "completed" : "stopped"}. ` +
          `Discovered ${session.foundCodes.length} active class sessions.`
      );
    }
  })();

  return { started: true };
}

export type { ValidClassCode };
