import Constants, { ExecutionEnvironment } from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { File, Paths } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha256";
import { Platform } from "react-native";

export const LOCAL_AGENT_MODEL_FILE = "mini-agent-v2-Q4_K_M.gguf";
export const LOCAL_AGENT_MODEL_BYTES = 986_050_816;
export const LOCAL_AGENT_MODEL_SHA256 =
  "7956a3cc0ccad6789a1ddcb24e5ca33fca34e6eca0243a465e78a13f240ce116";
export const LOCAL_AGENT_MODEL_URL =
  "https://huggingface.co/F-A-I-L/mini-agent-v2-GGUF/resolve/c9385e703ecf186e2f6a8f3efe175fd1201a0c36/mini-agent-v2-Q4_K_M.gguf";

export type LocalModelStatus =
  | "checking"
  | "downloading"
  | "verifying"
  | "downloaded"
  | "loading"
  | "ready"
  | "error"
  | "unsupported";

export interface LocalModelState {
  status: LocalModelStatus;
  downloadedBytes: number;
  totalBytes: number;
  message?: string;
}

const INITIAL_STATE: LocalModelState = {
  status: "unsupported",
  downloadedBytes: 0,
  totalBytes: LOCAL_AGENT_MODEL_BYTES,
};

const MODEL_MARKER_FILE = ".mini-agent-v2-verified";
const TEMP_MODEL_FILE = `${LOCAL_AGENT_MODEL_FILE}.partial`;
const HASH_CHUNK_BYTES = 1024 * 1024;
const HASH_YIELD_BYTES = 16 * 1024 * 1024;

let state = INITIAL_STATE;
let downloadTask: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;
let downloadPromise: Promise<void> | null = null;
let loadPromise: Promise<import("llama.rn").LlamaContext> | null = null;
let modelContext: import("llama.rn").LlamaContext | null = null;
let cancelRequested = false;
let lastProgressPublishAt = 0;
const listeners = new Set<(next: LocalModelState) => void>();

function setState(next: Partial<LocalModelState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

export function getLocalModelState(): LocalModelState {
  return state;
}

export function subscribeLocalModelState(
  listener: (next: LocalModelState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLocalAgentSupported(): boolean {
  return (
    Platform.OS === "android" &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  );
}

function modelFile() {
  return new File(Paths.document, LOCAL_AGENT_MODEL_FILE);
}

function tempModelFile() {
  return new File(Paths.document, TEMP_MODEL_FILE);
}

function markerFile() {
  return new File(Paths.document, MODEL_MARKER_FILE);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function calculateModelHash(file: File): Promise<string> {
  const handle = file.open();
  const digest = sha256.create();
  let bytesRead = 0;
  let nextYieldAt = HASH_YIELD_BYTES;
  try {
    const fileSize = handle.size ?? file.size;
    while (bytesRead < fileSize) {
      const bytes = handle.readBytes(
        Math.min(HASH_CHUNK_BYTES, fileSize - bytesRead),
      );
      if (!bytes.length) {
        throw new Error("The downloaded model ended before the expected file size.");
      }
      digest.update(bytes);
      bytesRead += bytes.length;
      if (bytesRead >= nextYieldAt) {
        setState({
          status: "verifying",
          downloadedBytes: bytesRead,
          totalBytes: fileSize,
          message: `Checking file integrity: ${formatBytes(bytesRead)} of ${formatBytes(fileSize)}`,
        });
        nextYieldAt += HASH_YIELD_BYTES;
        await yieldToUi();
      }
    }
  } finally {
    handle.close();
  }
  return Array.from(digest.digest(), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function removeFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // A missing partial file is already clean.
  }
}

async function hasVerifiedMarker(file: File): Promise<boolean> {
  if (!file.exists || file.size !== LOCAL_AGENT_MODEL_BYTES) return false;
  try {
    const saved = await markerFile().text();
    const expected = `${LOCAL_AGENT_MODEL_SHA256}:${file.size}:${file.modificationTime ?? 0}`;
    return saved.trim() === expected;
  } catch {
    return false;
  }
}

async function writeVerifiedMarker(file: File): Promise<void> {
  const marker = markerFile();
  await FileSystem.writeAsStringAsync(
    marker.uri,
    `${LOCAL_AGENT_MODEL_SHA256}:${file.size}:${file.modificationTime ?? 0}`,
  );
}

async function verifyModelFile(file: File): Promise<void> {
  if (file.size !== LOCAL_AGENT_MODEL_BYTES) {
    throw new Error(
      `Model file size is ${file.size} bytes; expected ${LOCAL_AGENT_MODEL_BYTES}.`,
    );
  }
  setState({
    status: "verifying",
    downloadedBytes: 0,
    totalBytes: file.size,
    message: "Checking the downloaded model…",
  });
  const actualHash = await calculateModelHash(file);
  if (actualHash !== LOCAL_AGENT_MODEL_SHA256) {
    throw new Error("The model checksum did not match. The incomplete file was removed.");
  }
  await writeVerifiedMarker(file);
}

async function performDownloadIfNeeded(): Promise<void> {
  if (!isLocalAgentSupported()) {
    setState({
      status: "unsupported",
      message:
        Platform.OS === "android"
          ? "Install the Android development build to use the local model. Expo Go does not include the native model runtime."
          : "The local model is available in the Android development build only.",
    });
    return;
  }

  const finalFile = modelFile();
  if (await hasVerifiedMarker(finalFile)) {
    setState({ status: modelContext ? "ready" : "downloaded", message: undefined });
    return;
  }

  if (finalFile.exists) {
    try {
      await verifyModelFile(finalFile);
      setState({ status: modelContext ? "ready" : "downloaded", message: undefined });
      return;
    } catch {
      await removeFile(finalFile.uri);
      await removeFile(markerFile().uri);
    }
  }

  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) {
    throw new Error("Phone storage is unavailable for the local model.");
  }

  try {
    const freeBytes = await FileSystem.getFreeDiskStorageAsync();
    if (freeBytes < LOCAL_AGENT_MODEL_BYTES + 64 * 1024 * 1024) {
      throw new Error(
        `Free up at least ${formatBytes(LOCAL_AGENT_MODEL_BYTES + 64 * 1024 * 1024)} of phone storage, then retry.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Free up at least")) {
      throw error;
    }
    // Some Android versions do not expose free-space metadata; the download
    // itself will still report a storage error if the write cannot complete.
  }

  await removeFile(tempModelFile().uri);
  cancelRequested = false;
  setState({
    status: "downloading",
    downloadedBytes: 0,
    totalBytes: LOCAL_AGENT_MODEL_BYTES,
    message: "Downloading the local Agent model. Cellular data may be used.",
  });

  downloadTask = FileSystem.createDownloadResumable(
    LOCAL_AGENT_MODEL_URL,
    `${documentDirectory}${TEMP_MODEL_FILE}`,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const now = Date.now();
      if (now - lastProgressPublishAt < 150 && totalBytesWritten < LOCAL_AGENT_MODEL_BYTES) {
        return;
      }
      lastProgressPublishAt = now;
      setState({
        status: "downloading",
        downloadedBytes: totalBytesWritten,
        totalBytes:
          totalBytesExpectedToWrite > 0
            ? totalBytesExpectedToWrite
            : LOCAL_AGENT_MODEL_BYTES,
      });
    },
  );

  try {
    const result = await downloadTask.downloadAsync();
    if (cancelRequested) return;
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Model download failed (HTTP ${result?.status ?? "unknown"}).`);
    }

    const partialFile = tempModelFile();
    await verifyModelFile(partialFile);
    if (finalFile.exists) await removeFile(finalFile.uri);
    partialFile.move(finalFile);
    await writeVerifiedMarker(finalFile);
    setState({
      status: modelContext ? "ready" : "downloaded",
      downloadedBytes: LOCAL_AGENT_MODEL_BYTES,
      totalBytes: LOCAL_AGENT_MODEL_BYTES,
      message: undefined,
    });
  } catch (error) {
    if (cancelRequested) return;
    await removeFile(tempModelFile().uri);
    await removeFile(markerFile().uri);
    throw error;
  } finally {
    downloadTask = null;
  }
}

export function ensureLocalModelDownloaded(): Promise<void> {
  if (downloadPromise) return downloadPromise;
  downloadPromise = performDownloadIfNeeded()
    .catch((error) => {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Model download failed.",
      });
      throw error;
    })
    .finally(() => {
      downloadPromise = null;
    });
  return downloadPromise;
}

export async function cancelLocalModelDownload(): Promise<void> {
  if (!downloadTask) return;
  cancelRequested = true;
  try {
    await downloadTask.cancelAsync();
  } finally {
    downloadTask = null;
    await removeFile(tempModelFile().uri);
    setState({
      status: "checking",
      downloadedBytes: 0,
      totalBytes: LOCAL_AGENT_MODEL_BYTES,
      message: "Download canceled. Retry whenever you are ready.",
    });
  }
}

export async function ensureLocalModelReady(): Promise<import("llama.rn").LlamaContext> {
  if (!isLocalAgentSupported()) {
    await ensureLocalModelDownloaded();
    throw new Error(
      getLocalModelState().message ??
        "The local model requires the Android development build.",
    );
  }
  if (modelContext) return modelContext;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await ensureLocalModelDownloaded();
    setState({ status: "loading", message: "Loading the local model into memory…" });
    const model = modelFile();
    if (!model.exists || model.size !== LOCAL_AGENT_MODEL_BYTES) {
      throw new Error("The verified local model file is not available.");
    }
    const llama = await import("llama.rn");
    await llama.toggleNativeLog(false);
    modelContext = await llama.initLlama({
      model: model.uri,
      use_mmap: true,
      n_ctx: 2048,
      n_threads: 2,
      n_gpu_layers: 0,
    });
    setState({
      status: "ready",
      downloadedBytes: LOCAL_AGENT_MODEL_BYTES,
      totalBytes: LOCAL_AGENT_MODEL_BYTES,
      message: undefined,
    });
    return modelContext;
  })()
    .catch((error) => {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not load the local model.",
      });
      throw error;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}
