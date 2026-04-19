import React, { useState } from "react";
import {
  Download, ExternalLink, FolderOpen, FileCode, Image as ImageIcon,
  Video, FileText, Smartphone, Package, X, Maximize2, CheckCircle2
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
  const colorClass = getTypeColor(projectType);
  const hasPreview = ["web", "image", "video", "document"].includes(projectType) ||
    (projectType === "document" && mainFile.endsWith(".pdf"));

  return (
    <div className={cn(
      "my-3 rounded-2xl border overflow-hidden",
      colorClass
    )}>
      {/* Header */}
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

      {/* Preview */}
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
