import React, { useState, useCallback } from "react";
import {
  Download, ExternalLink, FolderOpen, FileCode, Image as ImageIcon,
  Video, FileText, Smartphone, Package, X, Maximize2, CheckCircle2,
  Cloud, Loader2, RefreshCw, Clock, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  projectId: string;
  name: string;
  mainFile: string;
  projectType: string;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "web": return <FileCode className="w-5 h-5" />;
    case "image": return <ImageIcon className="w-5 h-5" />;
    case "video": return <Video className="w-5 h-5" />;
    case "document": return <FileText className="w-5 h-5" />;
    case "apk": return <Smartphone className="w-5 h-5" />;
    case "app": return <Package className="w-5 h-5" />;
    default: return <FolderOpen className="w-5 h-5" />;
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "web": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    case "image": return "text-pink-400 bg-pink-500/10 border-pink-500/30";
    case "video": return "text-red-400 bg-red-500/10 border-red-500/30";
    case "document": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "apk": return "text-green-400 bg-green-500/10 border-green-500/30";
    case "app": return "text-violet-400 bg-violet-500/10 border-violet-500/30";
    default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/30";
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "web": return "Web App";
    case "image": return "Image";
    case "video": return "Video";
    case "document": return "Document";
    case "apk": return "Android APK";
    case "app": return "Application";
    default: return "Project";
  }
}

function buildFileUrl(projectId: string, mainFile: string, download = false) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams({ path: mainFile });
  if (download) params.set("download", "1");
  return `${base}/api/projects/${projectId}/file?${params.toString()}`;
}

function buildDownloadUrl(projectId: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/api/projects/${projectId}/download`;
}

function extractEasBuildId(url: string): string | null {
  const match = url.match(/builds\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

type BuildStatus = "QUEUED" | "IN_PROGRESS" | "FINISHED" | "ERRORED" | "CANCELED" | "unknown";

interface EasStatusResult {
  status: BuildStatus;
  apkUrl: string | null;
  buildUrl: string | null;
  completedAt: string | null;
}

function CloudApkCard({ name, buildUrl }: { name: string; buildUrl: string }) {
  const easBuildId = extractEasBuildId(buildUrl);
  const [checking, setChecking] = useState(false);
  const [statusResult, setStatusResult] = useState<EasStatusResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!easBuildId) return;
    setChecking(true);
    setStatusError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/build-apk/${easBuildId}/status`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Status check failed (${res.status})`);
      }
      const data: EasStatusResult = await res.json();
      setStatusResult(data);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to check build status");
    } finally {
      setChecking(false);
    }
  }, [easBuildId]);

  const status = statusResult?.status ?? "QUEUED";
  const isFinished = status === "FINISHED";
  const isErrored = status === "ERRORED" || status === "CANCELED";
  const apkDownloadUrl = statusResult?.apkUrl;

  function statusLabel(s: BuildStatus) {
    switch (s) {
      case "QUEUED": return "Queued — waiting to start";
      case "IN_PROGRESS": return "Building now…";
      case "FINISHED": return "Build complete — ready to download!";
      case "ERRORED": return "Build failed";
      case "CANCELED": return "Build canceled";
      default: return "Status unknown";
    }
  }

  function statusColor(s: BuildStatus) {
    switch (s) {
      case "FINISHED": return "text-emerald-400";
      case "ERRORED":
      case "CANCELED": return "text-red-400";
      default: return "text-amber-400";
    }
  }

  return (
    <div className="my-3 rounded-2xl border overflow-hidden text-green-400 bg-green-500/10 border-green-500/30">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="shrink-0 mt-0.5 text-green-400">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{name}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border text-green-400 bg-green-500/10 border-green-500/30">
              Android APK
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {isFinished ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : isErrored ? (
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
            ) : (
              <Cloud className="w-3 h-3 text-amber-400 shrink-0 animate-pulse" />
            )}
            <span className={cn("text-[11px]", statusColor(status as BuildStatus))}>
              {statusLabel(status as BuildStatus)}
            </span>
          </div>
          {!isFinished && !isErrored && (
            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              <span>Cloud builds typically take 10–20 minutes</span>
            </div>
          )}
          {statusError && (
            <div className="mt-1.5 text-[11px] text-red-400">{statusError}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <a
          href={buildUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Track Build
        </a>

        {easBuildId && (
          <button
            onClick={checkStatus}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-foreground transition-colors disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Check Status
          </button>
        )}

        {apkDownloadUrl && (
          <a
            href={apkDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download APK
          </a>
        )}
      </div>
    </div>
  );
}

function PreviewContent({ projectId, mainFile, type }: { projectId: string; mainFile: string; type: string }) {
  const fileUrl = buildFileUrl(projectId, mainFile);
  const [imgError, setImgError] = useState(false);

  if (type === "image" && !imgError) {
    return (
      <div className="w-full bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center min-h-48 max-h-80">
        <img
          src={fileUrl}
          alt="Project preview"
          className="max-w-full max-h-80 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className="w-full bg-zinc-950 rounded-lg overflow-hidden">
        <video
          src={fileUrl}
          controls
          className="w-full max-h-72"
          preload="metadata"
        />
      </div>
    );
  }

  if (type === "web") {
    return (
      <div className="w-full rounded-lg overflow-hidden border border-border" style={{ height: "360px" }}>
        <iframe
          src={fileUrl}
          className="w-full h-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms"
          title={`Preview: ${mainFile}`}
        />
      </div>
    );
  }

  if (type === "document" && mainFile.endsWith(".pdf")) {
    return (
      <div className="w-full rounded-lg overflow-hidden border border-border" style={{ height: "400px" }}>
        <iframe
          src={`${fileUrl}#toolbar=0`}
          className="w-full h-full"
          title={`Preview: ${mainFile}`}
        />
      </div>
    );
  }

  return null;
}

export function ProjectCard({ projectId, name, mainFile, projectType }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(true);

  // Cloud APK build — mainFile is the Expo build tracking URL
  if (projectType === "apk" && mainFile.startsWith("https://")) {
    return <CloudApkCard name={name} buildUrl={mainFile} />;
  }

  const colorClass = getTypeColor(projectType);
  const hasPreview = ["web", "image", "video", "document"].includes(projectType) ||
    (projectType === "document" && mainFile.endsWith(".pdf"));

  return (
    <div className={cn(
      "my-3 rounded-2xl border overflow-hidden",
      colorClass
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn("shrink-0", colorClass.split(" ")[0])}>
          {getTypeIcon(projectType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{name}</span>
            <span className={cn(
              "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border",
              colorClass
            )}>
              {getTypeLabel(projectType)}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Built, tested &amp; ready</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasPreview && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              title={expanded ? "Collapse preview" : "Expand preview"}
            >
              {expanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <a
            href={buildFileUrl(projectId, mainFile, true)}
            download
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              "bg-white/10 hover:bg-white/20 text-foreground"
            )}
            title="Download main file"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          <a
            href={buildDownloadUrl(projectId)}
            download
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              "bg-white/10 hover:bg-white/20 text-foreground"
            )}
            title="Download all files as zip"
          >
            <Package className="w-3.5 h-3.5" />
            All Files
          </a>
        </div>
      </div>

      {expanded && hasPreview && (
        <div className="px-4 pb-4">
          <PreviewContent projectId={projectId} mainFile={mainFile} type={projectType} />
          {projectType === "web" && (
            <a
              href={buildFileUrl(projectId, mainFile)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>
          )}
        </div>
      )}
    </div>
  );
}
