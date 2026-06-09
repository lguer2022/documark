import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import { 
  FileText, 
  FileCode, 
  UploadCloud, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Download, 
  Copy, 
  Trash2, 
  FolderArchive,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Check,
  FileUp,
  AlertCircle
} from "lucide-react";
import JSZip from "jszip";

// Structure for managing state details of each file in our workspace
interface ConversionFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileObject: File;
  status: "pendiente" | "convirtiendo" | "convertido" | "error";
  markdown?: string;
  convertedName?: string;
  errorMessage?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"individual" | "lotes">("individual");
  
  // States for Individual Mode
  const [singleFile, setSingleFile] = useState<ConversionFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<"preview" | "raw">("preview");

  // States for Batch Mode (Lotes)
  const [batchFiles, setBatchFiles] = useState<ConversionFile[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Drag and drop states
  const [isDragging, setIsDragging] = useState(false);

  // Input refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Common file validation helper
  const validateAndCreateFile = (file: File): ConversionFile | null => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["doc", "docx", "pdf"].includes(ext)) {
      return null;
    }
    return {
      id: `${Date.now()}_${Math.random().toString(36).substring(5)}`,
      name: file.name,
      size: file.size,
      type: ext,
      fileObject: file,
      status: "pendiente"
    };
  };

  // Drag & drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(Array.from(e.dataTransfer.files));
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(Array.from(e.target.files));
    }
  };

  // Distribute files to state based on active tab
  const handleFileSelection = (rawFiles: File[]) => {
    const validFiles: ConversionFile[] = [];
    const invalidNames: string[] = [];

    rawFiles.forEach(f => {
      const conv = validateAndCreateFile(f);
      if (conv) {
        validFiles.push(conv);
      } else {
        invalidNames.push(f.name);
      }
    });

    if (invalidNames.length > 0) {
      alert(`Los siguientes archivos no pudieron ser cargados ya que no son .doc, .docx ni .pdf:\n${invalidNames.join("\n")}`);
    }

    if (validFiles.length === 0) return;

    if (activeTab === "individual") {
      // In individual mode, replace with the first valid file
      setSingleFile(validFiles[0]);
      setIsDragging(false);
      // Auto-trigger individual conversion for a fast user experience
      triggerIndividualConversion(validFiles[0]);
    } else {
      // In batch mode, append to list without duplicates
      setBatchFiles(prev => {
        // Prevent adding exact name/size duplicates
        const existingNames = new Set(prev.map(f => `${f.name}_${f.size}`));
        const filteredNew = validFiles.filter(nv => !existingNames.has(`${nv.name}_${nv.size}`));
        return [...prev, ...filteredNew];
      });
    }
  };

  // Convert an individual file via Express API
  const convertFileToServer = async (fileItem: ConversionFile): Promise<Partial<ConversionFile>> => {
    const formData = new FormData();
    formData.append("file", fileItem.fileObject);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${response.status})`);
      }

      const data = await response.json();
      return {
        status: "convertido",
        markdown: data.content,
        convertedName: data.filename
      };
    } catch (err: any) {
      return {
        status: "error",
        errorMessage: err.message || "Fallo al conectar con el servidor"
      };
    }
  };

  // Trigger individual conversion
  const triggerIndividualConversion = async (fileItem: ConversionFile) => {
    setSingleFile({ ...fileItem, status: "convirtiendo" });
    const result = await convertFileToServer(fileItem);
    setSingleFile(prev => {
      if (!prev || prev.id !== fileItem.id) return prev;
      return { ...prev, ...result };
    });
  };

  // Trigger conversion for all pending files in the list sequentially or concurrently
  const triggerBatchConversion = async () => {
    if (batchFiles.length === 0) return;
    setIsProcessingBatch(true);

    // Filter pending and error files to run/re-run them
    const filesToConvert = batchFiles.filter(f => f.status === "pendiente" || f.status === "error");
    
    // Process files concurrently for fast conversion speeds while showing progress
    await Promise.all(
      filesToConvert.map(async (file) => {
        // Update individual status to converting
        setBatchFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: "convirtiendo" } : f));
        
        const update = await convertFileToServer(file);

        setBatchFiles(prev => prev.map(f => f.id === file.id ? { ...f, ...update } : f));
      })
    );

    setIsProcessingBatch(false);
  };

  // Copy individual Markdown payload to clipboard
  const copyToClipboard = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download individual markdown file directly on the frontend
  const downloadMarkdownFile = (file: ConversionFile) => {
    if (!file.markdown || !file.convertedName) return;
    const blob = new Blob([file.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.convertedName;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Zip and download all converted documents inside the batch file array
  const downloadBatchAsZip = async () => {
    const completedFiles = batchFiles.filter(f => f.status === "convertido" && f.markdown);
    if (completedFiles.length === 0) return;

    const zip = new JSZip();
    completedFiles.forEach(file => {
      if (file.convertedName && file.markdown) {
        zip.file(file.convertedName, file.markdown);
      }
    });

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `documentos_markdown_${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error al comprimir los archivos en el ZIP.");
    }
  };

  // Remove a file from the batch queue
  const removeBatchFile = (id: string) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
  };

  // Helper to format bytes to matching KB/MB
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Document Icon color decider helper
  const getDocumentIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return <div className="p-2 sm:p-3 rounded-xl bg-red-500/10 text-red-400 border border-red-900/30"><FileText size={24} /></div>;
      case "doc":
        return <div className="p-2 sm:p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-900/30"><FileText size={24} /></div>;
      case "docx":
      default:
        return <div className="p-2 sm:p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-900/30"><FileCode size={24} /></div>;
    }
  };

  // Computed counters
  const totalCount = batchFiles.length;
  const completedCount = batchFiles.filter(f => f.status === "convertido").length;
  const errorCount = batchFiles.filter(f => f.status === "error").length;
  const pendingCount = batchFiles.filter(f => f.status === "pendiente").length;
  const convertingCount = batchFiles.filter(f => f.status === "convirtiendo").length;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col font-sans select-none" id="app_root">
      
      {/* Dynamic Navigation Header */}
      <header className="bg-[#090d16] border-b border-slate-900 sticky top-0 z-50 shadow-md" id="app_header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 text-slate-950 p-2.5 rounded-xl shadow-lg shadow-emerald-500/10 flex items-center justify-center">
              <FileCode size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                DocuMark
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest">
                  PRO
                </span>
              </h1>
              <p className="text-xs text-slate-400">Conversor seguro de .doc, .docx y .pdf a Markdown</p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-1 rounded-xl flex gap-1 w-full sm:w-auto" id="mode_selector">
            <button
              onClick={() => {
                setActiveTab("individual");
                setIsDragging(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === "individual"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
              id="btn_tab_individual"
            >
              <FileText size={16} />
              Conversión Individual
            </button>
            <button
              onClick={() => {
                setActiveTab("lotes");
                setIsDragging(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === "lotes"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
              id="btn_tab_lote"
            >
              <FolderArchive size={16} />
              Procesamiento por Lotes
              {batchFiles.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-950 text-emerald-400 rounded-full font-bold">
                  {batchFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8" id="app_main">
        
        {/* Dynamic Drag and Drop Dropzone Container (Wraps the workspace based on interactions) */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex-1 flex flex-col rounded-3xl border border-slate-800 transition-all duration-300 min-h-[480px] ${
            isDragging 
              ? "border-emerald-500 bg-emerald-500/5 scale-[0.99] shadow-inner" 
              : "border-slate-800 bg-[#090d16]/70 shadow-2xl backdrop-blur-md"
          }`}
          id="dropzone_container"
        >
          {/* Invisible Overlay when dragging over anywhere to catch elements perfectly */}
          {isDragging && (
            <div className="absolute inset-0 bg-emerald-500/5 rounded-3xl flex flex-col items-center justify-center z-40 pointer-events-none backdrop-blur-xs">
              <div className="bg-[#090d16] p-6 rounded-2xl shadow-xl border border-emerald-500/30 flex flex-col items-center justify-center animate-bounce">
                <UploadCloud size={48} className="text-emerald-400" />
              </div>
              <p className="mt-4 text-emerald-400 font-semibold text-lg">¡Soltá tus documentos aquí!</p>
              <p className="text-emerald-505 text-sm">Se cargará en el modo actual del conversor</p>
            </div>
          )}

          {/* Hidden standard file input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            multiple={activeTab === "lotes"}
            accept=".doc,.docx,.pdf"
            className="hidden"
            id="hidden_file_input"
          />

          {/* EMPTY STATE - Show when no file is uploaded yet */}
          {((activeTab === "individual" && !singleFile) || (activeTab === "lotes" && batchFiles.length === 0)) && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto" id="empty_uploader_workspace">
              <div className="mb-6 bg-slate-900/80 text-emerald-400 p-5 rounded-2xl border border-slate-800 inline-block shadow-inner shadow-black/40">
                {activeTab === "individual" ? <FileUp size={40} className="text-emerald-400" /> : <FolderArchive size={40} className="text-emerald-400" />}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {activeTab === "individual" ? "Convertí un Documento" : "Procesá Varios Archivos en Lote"}
              </h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                {activeTab === "individual" 
                  ? "Arrastrá un archivo o haz clic en examinar. Es compatible con .doc, .docx y .pdf. Se convertirá de forma inmediata." 
                  : "Cargá múltiples archivos para convertirlos en lista. Luego podrás descargarlos individualmente o empaquetados en un archivo .zip."}
              </p>
              
              <button
                onClick={triggerFileInput}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition duration-150 shadow-lg shadow-emerald-500/20"
                id="btn_browse_files"
              >
                <UploadCloud size={18} />
                Seleccionar Documentos
              </button>

              <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
                <span className="bg-slate-900/50 px-2.5 py-1 rounded-md border border-slate-800 font-medium">Archivos .doc / .docx</span>
                <span className="bg-slate-900/50 px-2.5 py-1 rounded-md border border-slate-800 font-medium">Documentos .pdf</span>
                <span className="bg-slate-900/50 px-2.5 py-1 rounded-md border border-slate-800 font-medium">Hasta 100MB</span>
              </div>
            </div>
          )}

          {/* ACTIVE WORKSPACE - INDIVIDUAL MODE */}
          {activeTab === "individual" && singleFile && (
            <div className="flex-1 flex flex-col lg:flex-row h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-800" id="individual_editor_layout">
              
              {/* Left Column - Input, Meta and Actions */}
              <div className="w-full lg:w-2/5 p-6 sm:p-8 flex flex-col justify-between" id="individual_left_panel">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Archivo Seleccionado</span>
                    <button 
                      onClick={() => setSingleFile(null)}
                      className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-900 transition duration-150 tooltip"
                      title="Eliminar archivo"
                      id="btn_reset_individual"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/50">
                    {getDocumentIcon(singleFile.type)}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 truncate" title={singleFile.name}>
                        {singleFile.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{formatBytes(singleFile.size)}</span>
                        <span>•</span>
                        <span className="uppercase font-medium text-emerald-400">{singleFile.type}</span>
                      </p>
                    </div>
                  </div>

                  {/* Operational Status Display */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Estado de Conversión</h4>
                    
                    {singleFile.status === "pendiente" && (
                      <div className="p-4 rounded-xl bg-slate-900 text-slate-400 flex items-center gap-3 border border-slate-800">
                        <Loader2 size={18} className="animate-spin text-slate-500" />
                        <div>
                          <p className="text-sm font-medium">Esperando envío</p>
                          <p className="text-xs text-slate-500">Preparado para pasar al motor de conversión local</p>
                        </div>
                      </div>
                    )}

                    {singleFile.status === "convirtiendo" && (
                      <div className="p-4 rounded-xl bg-blue-950/20 text-blue-300 flex items-center gap-3 border border-blue-900/40">
                        <Loader2 size={18} className="animate-spin text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-blue-200">Procesando documento...</p>
                          <p className="text-xs text-blue-400">Extrayendo texto y formateando marcas locales en el servidor</p>
                        </div>
                      </div>
                    )}

                    {singleFile.status === "convertido" && (
                      <div className="p-4 rounded-xl bg-emerald-950/20 text-emerald-300 flex items-center gap-3 border border-emerald-900/40">
                        <CheckCircle2 size={18} className="text-emerald-400" />
                        <div>
                          <p className="text-sm font-medium text-emerald-200">Convertido exitosamente</p>
                          <p className="text-xs text-emerald-400">Formato Markdown generado en 100% local</p>
                        </div>
                      </div>
                    )}

                    {singleFile.status === "error" && (
                      <div className="p-4 rounded-xl bg-red-950/20 text-red-350 flex items-center gap-3 border border-red-900/40">
                        <XCircle size={18} className="text-red-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-red-100">Fallo en la conversión</p>
                          <p className="text-xs text-red-400 truncate" title={singleFile.errorMessage}>
                            {singleFile.errorMessage || "Por favor, intente con otro archivo."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Left Panel Bottom Control Section */}
                <div className="pt-6 border-t border-slate-850 space-y-3">
                  {singleFile.status === "error" && (
                    <button
                      onClick={() => triggerIndividualConversion(singleFile)}
                      className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition duration-150 border border-slate-800 shadow-sm"
                      id="btn_retry_individual"
                    >
                      <RefreshCw size={16} />
                      Reintentar Conversión
                    </button>
                  )}

                  {singleFile.status === "convertido" && (
                    <div className="flex flex-col gap-2 w-full">
                      <button
                        onClick={() => downloadMarkdownFile(singleFile)}
                        className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl transition duration-150 shadow-lg shadow-emerald-500/20"
                        id="btn_download_individual"
                      >
                        <Download size={18} />
                        Descargar archivo .md
                      </button>
                      <button
                        onClick={() => copyToClipboard(singleFile.markdown)}
                        className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-100 font-medium py-2.5 px-4 rounded-xl transition duration-150"
                        id="btn_copy_individual"
                      >
                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        {copied ? "¡Copiado al Portapapeles!" : "Copiar todo el código"}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={triggerFileInput}
                    className="w-full inline-flex items-center justify-center gap-2 bg-transparent hover:bg-slate-900 text-slate-350 border border-slate-800 py-2.5 px-4 rounded-xl transition duration-150 text-xs font-semibold"
                    id="btn_upload_another_individual"
                  >
                    Cargar otro archivo
                  </button>
                </div>
              </div>

              {/* Right Column - Conversor Markdown Live Previewer */}
              <div className="w-full lg:w-3/5 flex flex-col bg-[#050911]/50 rounded-r-2xl overflow-hidden" id="individual_right_panel">
                <div className="px-6 py-4 border-b border-slate-900 bg-[#090d16]/70 flex items-center justify-between" id="preview_header">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-450 animate-pulse"></span>
                    <span className="text-sm font-semibold text-slate-350">Vista del Resultado</span>
                  </div>

                  {singleFile.status === "convertido" && (
                    <div className="bg-slate-950 p-1 rounded-lg flex gap-1 border border-slate-850">
                      <button
                        onClick={() => setActivePreviewTab("preview")}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md transition duration-150 ${
                          activePreviewTab === "preview"
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                        id="btn_preview_styled"
                      >
                        Visualización
                      </button>
                      <button
                        onClick={() => setActivePreviewTab("raw")}
                        className={`text-xs font-medium px-3 py-1.5 rounded-md transition duration-150 ${
                          activePreviewTab === "raw"
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                        id="btn_preview_raw"
                      >
                        Texto Plano (.md)
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-6 overflow-auto max-h-[500px] lg:max-h-[620px] relative" id="preview_content_viewport">
                  {singleFile.status === "pendiente" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                      <FileUp size={36} className="text-slate-650 stroke-[1.5] mb-2 animate-pulse" />
                      <p className="text-sm">Subí el documento y se procesará automáticamente.</p>
                    </div>
                  )}

                  {singleFile.status === "convirtiendo" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                      <Loader2 size={36} className="text-emerald-450 animate-spin mb-3" />
                      <p className="text-sm font-medium">Convirtiendo documento...</p>
                      <p className="text-xs text-slate-500 mt-1">Estructurando texto seguro a sintaxis Markdown</p>
                    </div>
                  )}

                  {singleFile.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                      <XCircle size={36} className="text-red-500 mb-2" />
                      <p className="text-sm font-medium text-slate-200 flex items-center">No se pudo procesar la vista previa</p>
                      <p className="text-xs text-slate-400 max-w-sm mt-1">
                        Ocurrió un error al convertir el documento a Markdown. Por favor, verificá que el archivo no esté protegido con contraseña o dañado.
                      </p>
                    </div>
                  )}

                  {singleFile.status === "convertido" && singleFile.markdown && (
                    <div className="h-full">
                      {activePreviewTab === "preview" ? (
                        <div className="prose prose-invert max-w-none text-slate-100" id="rendered_markdown_preview">
                          {/* Parse simple Markdown rules for beautiful styling representation inside browser preview */}
                          <div className="space-y-4 font-sans leading-relaxed text-sm">
                            {singleFile.markdown.split("\n\n").map((block, idx) => {
                              const trimmed = block.trim();
                              if (!trimmed) return null;

                              // Headers matching
                              if (trimmed.startsWith("### ")) {
                                return <h4 key={idx} className="text-base font-bold text-white mt-4 mb-2">{trimmed.replace("### ", "")}</h4>;
                              }
                              if (trimmed.startsWith("## ")) {
                                return <h3 key={idx} className="text-lg font-bold text-white mt-6 mb-3 border-b border-slate-800 pb-1">{trimmed.replace("## ", "")}</h3>;
                              }
                              if (trimmed.startsWith("# ")) {
                                return <h2 key={idx} className="text-xl font-extrabold text-white mt-2 mb-4 pb-2 border-b-2 border-slate-800">{trimmed.replace("# ", "")}</h2>;
                              }

                              // Bullet checklist format
                              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                                const items = trimmed.split("\n");
                                return (
                                  <ul key={idx} className="list-disc pl-5 space-y-1.5 text-slate-300">
                                    {items.map((it, i) => (
                                      <li key={i}>{it.replace(/^[-*]\s+/, "")}</li>
                                    ))}
                                  </ul>
                                );
                              }

                              // Numbered lists format
                              if (/^\d+\.\s/.test(trimmed)) {
                                const items = trimmed.split("\n");
                                return (
                                  <ol key={idx} className="list-decimal pl-5 space-y-1.5 text-slate-300">
                                    {items.map((it, i) => (
                                      <li key={i}>{it.replace(/^\d+\.\s+/, "")}</li>
                                    ))}
                                  </ol>
                                );
                              }

                              // Horizontal lines format
                              if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
                                return <hr key={idx} className="my-6 border-t-2 border-slate-800" />;
                              }

                              // Paragraph representation
                              return <p key={idx} className="text-slate-300 whitespace-pre-line">{trimmed}</p>;
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full relative" id="raw_markdown_pane">
                          <pre className="font-mono text-xs text-emerald-400 bg-slate-950 p-5 rounded-2xl border border-slate-900 overflow-auto whitespace-pre-wrap max-h-[460px] leading-relaxed">
                            {singleFile.markdown}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE WORKSPACE - BATCH MODE (LOTES) */}
          {activeTab === "lotes" && batchFiles.length > 0 && (
            <div className="flex-1 flex flex-col justify-between p-6 sm:p-8" id="batch_uploader_workspace">
              <div className="space-y-6">
                
                {/* Batch dashboard info card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-850" id="batch_dashboard_panel">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">Cola de Procesamiento</h3>
                    <p className="text-xs text-slate-400">
                      Cargados: <strong className="text-white">{totalCount}</strong> • 
                      Listos: <strong className="text-emerald-400">{completedCount}</strong> • 
                      Pendientes: <strong className="text-yellow-500">{pendingCount}</strong> • 
                      Errores: <strong className="text-red-400">{errorCount}</strong>
                    </p>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={triggerFileInput}
                      className="inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-850 px-4 py-2 rounded-lg text-xs transition duration-150"
                      id="btn_add_more_lote"
                    >
                      <UploadCloud size={14} />
                      Añadir más
                    </button>
                    <button
                      onClick={() => setBatchFiles([])}
                      className="inline-flex items-center justify-center gap-1.5 bg-red-950/20 hover:bg-red-900/30 text-red-400 font-semibold px-4 py-2 rounded-lg text-xs transition duration-150 border border-red-900/20"
                      id="btn_clear_batch_list"
                    >
                      <Trash2 size={14} />
                      Vaciar cola
                    </button>
                  </div>
                </div>

                {/* Progressive Global Progress Bar */}
                {isProcessingBatch && (
                  <div className="bg-blue-950/10 p-4 rounded-xl border border-blue-900/30 space-y-2 animate-pulse" id="global_progress_widget">
                    <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={14} className="animate-spin text-blue-455" />
                        Conversión de lote activa...
                      </span>
                      <span>{completedCount + errorCount} de {totalCount} procesados</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden shadow-inner border border-slate-800">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${( (completedCount + errorCount) / totalCount ) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Files Queue List Container */}
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1" id="batch_files_queue">
                  {batchFiles.map((file, i) => (
                    <div 
                      key={file.id} 
                      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition duration-150 ${
                        file.status === "convertido" 
                          ? "bg-emerald-950/10 border-emerald-900/40 hover:bg-emerald-950/20" 
                          : file.status === "error" 
                            ? "bg-red-950/10 border-red-900/30 hover:bg-red-950/20" 
                            : "bg-slate-900/40 border-slate-850 hover:border-slate-800 hover:shadow-lg"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="text-xs text-slate-500 font-semibold font-mono w-5 shrink-0 hidden sm:inline-block">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        
                        {getDocumentIcon(file.type)}

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-100 truncate text-sm" title={file.name}>
                            {file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <span>{formatBytes(file.size)}</span>
                            <span>•</span>
                            <span className="uppercase text-slate-500 font-medium">{file.type}</span>
                          </div>
                        </div>
                      </div>

                      {/* File Queue Item Badges & Control actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-0 border-slate-800/50">
                        {/* Queue State Badges */}
                        <div id={`state_badge_${file.id}`}>
                          {file.status === "pendiente" && (
                            <span className="inline-flex items-center gap-1 bg-slate-900 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-md text-xs font-semibold uppercase">
                              Pendiente
                            </span>
                          )}
                          {file.status === "convirtiendo" && (
                            <span className="inline-flex items-center gap-1 bg-blue-950/40 border border-blue-900/60 text-blue-400 px-2.5 py-1 rounded-md text-xs font-semibold uppercase animate-pulse">
                              <Loader2 size={12} className="animate-spin text-blue-550" />
                              Convirtiendo
                            </span>
                          )}
                          {file.status === "convertido" && (
                            <span className="inline-flex items-center gap-1 bg-emerald-950/40 border border-emerald-900/65 text-emerald-400 px-2.5 py-1 rounded-md text-xs font-semibold uppercase">
                              <Check size={12} className="text-emerald-450" />
                              Listo
                            </span>
                          )}
                          {file.status === "error" && (
                            <span className="inline-flex items-center gap-1 bg-red-950/40 border border-red-900/60 text-red-450 px-2.5 py-1 rounded-md text-xs font-semibold uppercase hover:help cursor-help" title={file.errorMessage}>
                              <XCircle size={12} className="text-red-405" />
                              Error
                            </span>
                          )}
                        </div>

                        {/* File operations */}
                        <div className="flex items-center gap-1">
                          {file.status === "convertido" && (
                            <button
                              onClick={() => downloadMarkdownFile(file)}
                              className="p-2 text-emerald-400 hover:bg-emerald-950/60 rounded-lg transition duration-150 tooltip"
                              title="Descargar archivo .md"
                              id={`btn_download_file_${file.id}`}
                            >
                              <Download size={15} />
                            </button>
                          )}
                          
                          {file.status === "error" && (
                            <button
                              onClick={async () => {
                                setBatchFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: "convirtiendo" } : f));
                                const update = await convertFileToServer(file);
                                setBatchFiles(prev => prev.map(f => f.id === file.id ? { ...f, ...update } : f));
                              }}
                              className="p-2 text-slate-350 hover:bg-slate-800 rounded-lg transition duration-150 tooltip"
                              title="Reintentar este archivo"
                              id={`btn_retry_file_${file.id}`}
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => removeBatchFile(file.id)}
                            disabled={isProcessingBatch}
                            className={`p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition duration-150 ${isProcessingBatch ? "opacity-30 cursor-not-allowed" : ""}`}
                            title="Quitar de la lista"
                            id={`btn_remove_file_${file.id}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

              </div>

              {/* Batch Action Bar Footer (at bottom of file workspace) */}
              <div className="pt-6 border-t border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-4" id="batch_footer">
                <span className="text-xs text-slate-400">
                  {completedCount} de {totalCount} archivos convertidos listos para compilar
                </span>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {pendingCount > 0 && (
                    <button
                      onClick={triggerBatchConversion}
                      disabled={isProcessingBatch}
                      className="inline-flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:bg-slate-950 text-white font-bold px-6 py-3 rounded-xl transition duration-150 shadow-sm w-full sm:w-auto"
                      id="btn_trigger_batch_conversion"
                    >
                      <RefreshCw size={16} className={isProcessingBatch ? "animate-spin" : ""} />
                      Convertir Archivos Pendientes
                    </button>
                  )}

                  {completedCount > 0 && (
                    <button
                      onClick={downloadBatchAsZip}
                      className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-bold px-6 py-3 rounded-xl transition duration-150 shadow-lg shadow-emerald-500/20 w-full sm:w-auto"
                      id="btn_download_batch_zip"
                    >
                      <FolderArchive size={16} />
                      Descargar todos en ZIP ({completedCount})
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Security & Sovereign Local Trust Panel Badge */}
        <section className="bg-[#090d16]/70 border border-slate-850 rounded-3xl p-6" id="security_disclaimer">
          <div className="flex gap-4 items-start">
            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-900/30 p-2.5 rounded-xl shrink-0 mt-0.5">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Privacidad y Procesamiento 100% Local Guardado</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Esta aplicación procesa todos tus documentos <strong>localmente dentro de nuestro propio servidor de aplicación privado</strong>. 
                Los archivos temporales generados durante la conversión son eliminados inmediatamente, asegurando la soberanía y confidencialidad de tus datos. 
                Ningún documento se transfiere a redes externas ni a proveedores externos de IA.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* App Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 mt-auto" id="app_footer">
        <p>© 2026 DocuMark. Desarrollado con tecnología de procesamiento de documentos en Node.js de alta fidelidad.</p>
      </footer>

    </div>
  );
}
