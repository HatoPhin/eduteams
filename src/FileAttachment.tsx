// src/FileAttachment.tsx
// 添付ファイルの表示コンポーネント
//  - 画像: その場でプレビュー表示(クリックで拡大)
//  - PDF / テキスト: クリックで「プレビュー」か「保存」を選択
//  - Word / Excel など: クリックで「保存」(ブラウザでは表示できないため)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { client } from './appwrite';
import { FileText, Download, Eye, X, Image as ImageIcon } from 'lucide-react';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|md|csv|json|log)$/i;

// 保存時は /download、表示時は /view のURLを使う
const toViewUrl = (url: string) => url.replace('/download?', '/view?');

// ログイン中のセッションを付けてファイルを取得する
// (imgタグ直指定だとセッションが送られず、権限エラーになることがあるため)
const blobCache = new Map<string, Promise<Blob>>();

function fetchBlob(url: string): Promise<Blob> {
  const key = toViewUrl(url);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const headers: Record<string, string> = {
    'X-Appwrite-Project': client.config.project
  };
  try {
    const fallback = localStorage.getItem('cookieFallback');
    if (fallback) headers['X-Fallback-Cookies'] = fallback;
  } catch {
    /* localStorage が使えない環境では何もしない */
  }

  const p = fetch(key, { headers, credentials: 'include' }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  });
  p.catch(() => blobCache.delete(key));
  blobCache.set(key, p);
  return p;
}

// Blob → 表示用URL (失敗時はURL直指定にフォールバック)
function useBlobUrl(url: string, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let objectUrl: string | null = null;
    let active = true;
    setError(false);
    fetchBlob(url)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!active) return;
        setSrc(toViewUrl(url));
        setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, enabled]);

  return { src, error };
}

async function saveFile(name: string, url: string) {
  try {
    const blob = await fetchBlob(url);
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full">
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ---------- 画像 ---------- */
function ImageAttachment({ name, url }: { name: string; url: string }) {
  const { src } = useBlobUrl(url, true);
  const [open, setOpen] = useState(false);

  return (
    <span className="block my-1.5">
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onClick={() => setOpen(true)}
          className="max-h-60 max-w-full sm:max-w-sm rounded-lg border border-gray-700 cursor-zoom-in hover:border-indigo-500/60 transition-colors"
        />
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] border border-gray-600 rounded text-xs text-gray-400">
          <ImageIcon size={14} />
          画像を読み込み中...
        </span>
      )}
      <span className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
        <span className="truncate max-w-[16rem]">{name}</span>
        <button
          type="button"
          onClick={() => saveFile(name, url)}
          className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200"
        >
          <Download size={11} />
          保存
        </button>
      </span>

      {open && src && (
        <Modal onClose={() => setOpen(false)}>
          <div className="relative">
            <img src={src} alt={name} className="max-w-[92vw] max-h-[85vh] rounded-lg shadow-2xl" />
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                type="button"
                onClick={() => saveFile(name, url)}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full"
                title="保存"
              >
                <Download size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full"
                title="閉じる"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </span>
  );
}

/* ---------- PDF / テキスト / その他 ---------- */
function PreviewBody({ name, url }: { name: string; url: string }) {
  const isPdf = PDF_EXT.test(name);
  const { src } = useBlobUrl(url, true);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (isPdf) return;
    fetchBlob(url)
      .then((b) => b.text())
      .then(setText)
      .catch(() => setText('プレビューを読み込めませんでした。「保存」からファイルを開いてください。'));
  }, [url, isPdf]);

  if (isPdf) {
    return src ? (
      <iframe title={name} src={src} className="w-[92vw] max-w-4xl h-[80vh] bg-white rounded-lg" />
    ) : (
      <div className="text-xs text-gray-300 p-6">読み込み中...</div>
    );
  }
  return (
    <pre className="w-[92vw] max-w-3xl max-h-[80vh] overflow-auto bg-[#1b1b1b] text-gray-200 text-xs p-4 rounded-lg whitespace-pre-wrap">
      {text ?? '読み込み中...'}
    </pre>
  );
}

function FileChip({ name, url }: { name: string; url: string }) {
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState(false);
  const previewable = PDF_EXT.test(name) || TEXT_EXT.test(name);

  const close = () => {
    setMenu(false);
    setPreview(false);
  };

  return (
    <span className="block my-1.5">
      <button
        type="button"
        onClick={() => setMenu(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-gray-600 rounded text-xs text-indigo-300 hover:text-indigo-200 transition-all duration-200 shadow-sm hover:shadow"
      >
        <FileText size={14} />
        <span>{name}</span>
      </button>

      {menu && !preview && (
        <Modal onClose={close}>
          <div className="w-[min(92vw,22rem)] bg-[#252526] border border-[#3a3a3a] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={18} className="text-indigo-400 shrink-0" />
                <span className="text-sm text-white break-all">{name}</span>
              </div>
              <button type="button" onClick={close} className="text-gray-400 hover:text-white shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {previewable ? (
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Eye size={14} />
                  プレビューで開く
                </button>
              ) : (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  このファイル形式はブラウザ上でプレビューできません。保存して、パソコンのアプリで開いてください。
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  saveFile(name, url);
                  close();
                }}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-[#333] hover:bg-[#3d3d3d] border border-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Download size={14} />
                保存する
              </button>
            </div>
          </div>
        </Modal>
      )}

      {menu && preview && (
        <Modal onClose={close}>
          <div className="relative">
            <PreviewBody name={name} url={url} />
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                type="button"
                onClick={() => saveFile(name, url)}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full"
                title="保存"
              >
                <Download size={16} />
              </button>
              <button
                type="button"
                onClick={close}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full"
                title="閉じる"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </span>
  );
}

export default function FileAttachment({ name, url }: { name: string; url: string }) {
  return IMAGE_EXT.test(name) ? <ImageAttachment name={name} url={url} /> : <FileChip name={name} url={url} />;
}
