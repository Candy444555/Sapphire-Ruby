import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { 
  UploadCloud, 
  ArrowLeft, 
  RefreshCw, 
  Loader2, 
  Trash2, 
  FileText, 
  Package,
  Inbox,
  AlertTriangle,
  Download
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UploadedFile {
  filename: string;
  size: number;
  uploadedAt: string;
  isApk: boolean;
  downloadPath: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function UploadPage() {
  const [, navigate] = useLocation();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadingName, setUploadingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/uploads`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      setError("Maximum upload size is 200 MB.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadingName(file.name);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });
      fetchFiles();
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadingName("");
    }
  };

  const deleteFile = async (filename: string) => {
    if (!confirm(`Remove "${filename}"?`)) return;
    try {
      await fetch(`${BASE}/api/uploads/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
    } catch {
      setError("Could not delete file.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-mono flex flex-col">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#e6edf3] transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="w-px h-4 bg-[#30363d]" />
        <UploadCloud className="w-4 h-4 text-[#3fb950]" />
        <div className="flex flex-col">
          <span className="text-[#e6edf3] font-bold text-sm leading-none">UPLOADS</span>
          <span className="text-[#8b949e] text-[10px] uppercase font-bold tracking-wider">APK & File Manager</span>
        </div>
        <button onClick={fetchFiles} className="ml-auto text-[#8b949e] hover:text-[#e6edf3] p-1">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          
          {/* Upload Area */}
          <div className="space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-[#30363d] rounded-xl hover:border-[#3fb950]/50 hover:bg-[#3fb950]/5 transition-all group"
            >
              {uploading ? (
                <Loader2 className="w-10 h-10 animate-spin text-[#3fb950] mb-4" />
              ) : (
                <UploadCloud className="w-10 h-10 text-[#8b949e] group-hover:text-[#3fb950] mb-4" />
              )}
              <div className="text-sm font-bold text-[#e6edf3]">
                {uploading ? "Uploading..." : "Click to pick a file"}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">APK, ZIP, PDF, images · max 200 MB</div>
            </button>

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b949e] truncate max-w-[80%]">{uploadingName}</span>
                  <span className="text-[#3fb950] font-bold">{progress}%</span>
                </div>
                <div className="h-1.5 bg-[#161b22] border border-[#30363d] rounded-full overflow-hidden">
                  <div className="h-full bg-[#3fb950] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-[#3d1a1a] border border-[#f85149]/30 rounded-lg text-[#f85149] text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* File List */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-[#8b949e] uppercase tracking-widest px-1">Managed Files</h3>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#3fb950]" /></div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8b949e]">
                <Inbox className="w-12 h-12 stroke-1 opacity-20" />
                <p className="text-sm">No files uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map(file => (
                  <div key={file.filename} className="flex items-center gap-4 p-4 bg-[#161b22] border border-[#30363d] rounded-lg hover:border-[#8b949e]/30 transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file.isApk ? "bg-[#3fb950]/10 border border-[#3fb950]/20" : "bg-[#21262d] border border-[#30363d]"}`}>
                      {file.isApk ? <Package className="w-5 h-5 text-[#3fb950]" /> : <FileText className="w-5 h-5 text-[#8b949e]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#e6edf3] truncate">{file.filename}</div>
                      <div className="flex items-center gap-3 text-[10px] text-[#8b949e] mt-0.5">
                        {file.isApk && <span className="bg-[#3fb950]/20 text-[#3fb950] px-1.5 py-0.5 rounded font-bold border border-[#3fb950]/30">APK</span>}
                        <span>{formatBytes(file.size)}</span>
                        <span>·</span>
                        <span>{timeAgo(file.uploadedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`${BASE}${file.downloadPath}`}
                        download
                        className="p-2 text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#1c2128] rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => deleteFile(file.filename)}
                        className="p-2 text-[#8b949e] hover:text-[#f85149] hover:bg-[#3d1a1a]/50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
