import React, { useState, useEffect, useRef } from 'react';
import { ID, Query, Models } from 'appwrite';
import { 
  client, 
  databases, 
  storage,
  account,
  DB_ID, 
  MESSAGES_COLLECTION_ID,
  STORAGE_BUCKET_ID
} from './appwrite';
import { 
  MessageSquare, 
  Users, 
  BookOpen, 
  Send, 
  Paperclip, 
  Smile, 
  GraduationCap, 
  Hash, 
  ChevronDown,
  FileText,
  Clock,
  CheckCircle2,
  PlusCircle,
  FolderOpen,
  Calendar,
  AlertCircle,
  RotateCcw,
  Download,
  X,
  LogOut,
  UserCheck,
  Lock,
  Mail,
  User
} from 'lucide-react';

interface ChatMessage {
  $id: string;
  content: string;
  sender_name: string;
  sender_role: 'teacher' | 'student';
  channel_id: string;
  reply_count?: number;
  $createdAt: string;
}

interface SharedFileItem {
  id: string;
  name: string;
  url: string;
  size: string;
  date: string;
}

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  description: string;
  channel: string;
  submissions: {
    studentName: string;
    submittedAt: string;
    content: string;
  }[];
}

export default function App() {
  // 認証関連ステート
  const [currentUser, setCurrentUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<'student' | 'teacher'>('student');
  const [authError, setAuthError] = useState('');

  // アプリUI・ナビゲーション
  const [currentNav, setCurrentNav] = useState<'chat' | 'teams' | 'assignments'>('teams');
  const [currentTab, setCurrentTab] = useState<'posts' | 'files' | 'assignments'>('posts');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [activeChannel, setActiveChannel] = useState('general');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ファイル添付
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sharedFiles, setSharedFiles] = useState<SharedFileItem[]>([
    {
      id: 'mock-1',
      name: 'シラバス・講義計画.pdf',
      url: '#',
      size: '1.2 MB',
      date: '2026/09/20'
    }
  ]);

  // 課題
  const [assignments, setAssignments] = useState<Assignment[]>([
    {
      id: 'asg-1',
      title: '第3回：情報通信プロトコルの考察レポート',
      dueDate: '2026-10-15T23:59',
      description: '講義で扱ったトランスポート層（TCP/UDP）の特性差と、リアルタイム通信で求められる要件について論じなさい。',
      channel: 'general',
      submissions: []
    }
  ]);
  const [submissionText, setSubmissionText] = useState<{ [key: string]: string }>({});
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 1. 初回ログイン状態チェック
  useEffect(() => {
    checkLoggedInUser();
  }, []);

  const checkLoggedInUser = async () => {
    try {
      setAuthLoading(true);
      const user = await account.get();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  // ログイン処理
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await account.createEmailPasswordSession(authEmail, authPassword);
      await checkLoggedInUser();
    } catch (err: any) {
      setAuthError(err.message || 'ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    }
  };

  // アカウント新規登録処理
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await account.create(ID.unique(), authEmail, authPassword, authName);
      await account.createEmailPasswordSession(authEmail, authPassword);
      // ロール情報を Preferences に保存
      await account.updatePrefs({ role: authRole });
      await checkLoggedInUser();
    } catch (err: any) {
      setAuthError(err.message || 'アカウント作成に失敗しました。');
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return;
    try {
      await account.deleteSession('current');
      setCurrentUser(null);
      setMessages([]);
    } catch (err) {
      console.error('ログアウトエラー:', err);
    }
  };

  // ログイン中ユーザーのロール取得
  const userRole = (currentUser?.prefs?.role as 'teacher' | 'student') || 'student';
  const displayUserName = currentUser?.name || '匿名ユーザー';

  // 2. メッセージ取得 & Realtime購読（ログイン時のみ）
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    databases.listDocuments(DB_ID, MESSAGES_COLLECTION_ID, [
      Query.equal('channel_id', activeChannel),
      Query.orderAsc('$createdAt'),
      Query.limit(50),
    ])
    .then((response) => {
      setMessages(response.documents as unknown as ChatMessage[]);
    })
    .catch((err) => {
      console.error('データ取得エラー:', err);
    })
    .finally(() => {
      setLoading(false);
    });

    const unsubscribe = client.subscribe(
      `databases.${DB_ID}.collections.${MESSAGES_COLLECTION_ID}.documents`,
      (response) => {
        if (response.events.some((e) => e.includes('.create'))) {
          const newDoc = response.payload as ChatMessage;
          if (newDoc.channel_id === activeChannel) {
            setMessages((prev) => [...prev, newDoc]);
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeChannel, currentUser]);

  useEffect(() => {
    if (currentTab === 'posts') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentTab]);

  // メッセージ送信処理
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() && !selectedFile) return;

    setUploading(true);
    let finalContent = inputContent.trim();

    try {
      if (selectedFile) {
        const uploaded = await storage.createFile(
          STORAGE_BUCKET_ID,
          ID.unique(),
          selectedFile
        );

        const fileUrl = storage.getFileDownload(STORAGE_BUCKET_ID, uploaded.$id);
        const fileTag = `\n📎 添付ファイル: [${selectedFile.name}](${fileUrl})`;
        finalContent = finalContent ? `${finalContent}\n${fileTag}` : fileTag;

        setSharedFiles((prev) => [
          {
            id: uploaded.$id,
            name: selectedFile.name,
            url: fileUrl.toString(),
            size: `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
            date: new Date().toLocaleDateString('ja-JP')
          },
          ...prev
        ]);

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      setInputContent('');

      await databases.createDocument(
        DB_ID,
        MESSAGES_COLLECTION_ID,
        ID.unique(),
        {
          content: finalContent,
          sender_name: displayUserName,
          sender_role: userRole,
          channel_id: activeChannel,
          reply_count: 0
        }
      );
    } catch (err) {
      console.error('送信エラー:', err);
      alert('メッセージの送信に失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // 課題作成（教員用）
  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate.trim()) return;

    const newAssignment: Assignment = {
      id: `asg-${Date.now()}`,
      title: newTitle,
      dueDate: newDueDate,
      description: newDesc,
      channel: activeChannel,
      submissions: []
    };

    setAssignments((prev) => [newAssignment, ...prev]);
    setNewTitle('');
    setNewDueDate('');
    setNewDesc('');
    setShowCreateModal(false);
  };

  // 課題提出（生徒用）
  const handleSubmitAssignment = (assignmentId: string, dueDate: string) => {
    if (new Date().getTime() > new Date(dueDate).getTime()) {
      alert('提出期限を過ぎているため提出できません。');
      return;
    }

    const text = submissionText[assignmentId];
    if (!text || !text.trim()) {
      alert('提出内容を入力してください。');
      return;
    }

    setAssignments((prev) =>
      prev.map((asg) => {
        if (asg.id === assignmentId) {
          const filtered = asg.submissions.filter((s) => s.studentName !== displayUserName);
          return {
            ...asg,
            submissions: [
              ...filtered,
              {
                studentName: displayUserName,
                submittedAt: new Date().toLocaleString('ja-JP', { hour12: false }),
                content: text
              }
            ]
          };
        }
        return asg;
      })
    );

    setSubmissionText((prev) => ({ ...prev, [assignmentId]: '' }));
    alert('課題を提出しました！');
  };

  // 課題取り下げ
  const handleCancelSubmission = (assignmentId: string, dueDate: string, previousContent: string) => {
    if (new Date().getTime() > new Date(dueDate).getTime()) {
      alert('提出期限を過ぎているため取り下げはできません。');
      return;
    }

    if (!confirm('提出を取り下げて編集し直しますか？')) return;

    setAssignments((prev) =>
      prev.map((asg) => {
        if (asg.id === assignmentId) {
          return {
            ...asg,
            submissions: asg.submissions.filter((s) => s.studentName !== displayUserName)
          };
        }
        return asg;
      })
    );

    setSubmissionText((prev) => ({ ...prev, [assignmentId]: previousContent }));
  };

  const formatDateTime = (dtStr: string) => {
    if (!dtStr) return '';
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderMessageContent = (text: string) => {
    const fileRegex = /📎 添付ファイル: \[(.+?)\]\((.+?)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = fileRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const fileName = match[1];
      const fileUrl = match[2];
      parts.push(
        <a
          key={match.index}
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 my-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-gray-600 rounded text-xs text-indigo-300 hover:text-indigo-200 transition"
        >
          <FileText size={14} />
          <span>{fileName}</span>
          <Download size={12} className="ml-1 text-gray-400" />
        </a>
      );
      lastIndex = fileRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  // 認証確認中のロード画面
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1f1f1f] text-gray-300">
        <div className="text-sm flex items-center gap-2">
          <Clock className="animate-spin text-indigo-400" size={18} />
          ログイン状態を確認中...
        </div>
      </div>
    );
  }

  // 未ログイン時：ログイン／新規登録画面
  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#18181b] text-gray-200 font-sans p-4">
        <div className="w-full max-w-md bg-[#242427] border border-[#3f3f46] rounded-xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-lg mb-3">
              ET
            </div>
            <h1 className="text-lg font-bold tracking-wide text-white">EduTeams ログイン</h1>
            <p className="text-xs text-gray-400 mt-1">講義・演習コラボレーションシステム</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs leading-relaxed">
              {authError}
            </div>
          )}

          <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="space-y-4">
            {isRegisterMode && (
              <>
                <div>
                  <label className="text-xs text-gray-300 font-medium block mb-1">氏名 / ニックネーム</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      required
                      placeholder="例: 山田 太郎"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full bg-[#18181b] border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-300 font-medium block mb-1">登録ロール</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthRole('student')}
                      className={`flex-1 py-2 text-xs rounded-lg border font-medium transition ${
                        authRole === 'student' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400'
                      }`}
                    >
                      生徒 / 受講生
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthRole('teacher')}
                      className={`flex-1 py-2 text-xs rounded-lg border font-medium transition ${
                        authRole === 'teacher' ? 'bg-amber-600 border-amber-500 text-white' : 'border-gray-700 text-gray-400'
                      }`}
                    >
                      教員 / TA
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">メールアドレス</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">パスワード</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="8文字以上"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-md mt-2"
            >
              {isRegisterMode ? '新規アカウントを作成してログイン' : 'サインイン'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthError(''); }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
            >
              {isRegisterMode ? 'アカウントを既にお持ちの方はこちら (ログイン)' : 'アカウントをお持ちでない方はこちら (新規登録)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ログイン後のメイン画面
  return (
    <div className="flex h-screen bg-[#1f1f1f] text-gray-200 select-none font-sans overflow-hidden">
      {/* 最左端：アプリアイコンバー */}
      <div className="w-16 bg-[#201f1e] flex flex-col items-center py-4 border-r border-[#2d2c2c] gap-6 shrink-0">
        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
          ET
        </div>
        <div className="flex flex-col gap-4 text-gray-400">
          <button 
            onClick={() => { setCurrentNav('teams'); setCurrentTab('posts'); }}
            className={`flex flex-col items-center gap-1 transition ${
              currentNav === 'teams' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <Users size={22} />
            <span className="text-[10px]">チーム</span>
          </button>
          <button 
            onClick={() => { setCurrentNav('chat'); setCurrentTab('posts'); }}
            className={`flex flex-col items-center gap-1 transition ${
              currentNav === 'chat' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <MessageSquare size={22} />
            <span className="text-[10px]">チャット</span>
          </button>
          <button 
            onClick={() => { setCurrentNav('assignments'); setCurrentTab('assignments'); }}
            className={`flex flex-col items-center gap-1 transition ${
              currentNav === 'assignments' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <BookOpen size={22} />
            <span className="text-[10px]">課題</span>
          </button>
        </div>
      </div>

      {/* 左サイドバー：チャンネル一覧 & アカウント情報 */}
      <div className="w-64 bg-[#2b2b2b] flex flex-col border-r border-[#383838] shrink-0">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#383838]">
          <span className="font-semibold text-sm tracking-wide">情報通信工学 演習</span>
          <ChevronDown size={16} className="text-gray-400 cursor-pointer" />
        </div>
        <div className="p-3 flex flex-col gap-1 overflow-y-auto">
          <span className="text-xs font-semibold text-gray-400 px-2 py-1">チャネル</span>
          <button
            onClick={() => setActiveChannel('general')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition ${
              activeChannel === 'general' ? 'bg-[#3b3a39] text-white' : 'text-gray-300 hover:bg-[#333333]'
            }`}
          >
            <Hash size={16} />
            一般（講義連絡）
          </button>
          <button
            onClick={() => setActiveChannel('questions')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition ${
              activeChannel === 'questions' ? 'bg-[#3b3a39] text-white' : 'text-gray-300 hover:bg-[#333333]'
            }`}
          >
            <Hash size={16} />
            質問・相談
          </button>
        </div>

        {/* ユーザーアカウント & ログアウト */}
        <div className="mt-auto p-3 border-t border-[#383838] bg-[#242424] flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
              userRole === 'teacher' ? 'bg-amber-600 text-white' : 'bg-indigo-600 text-white'
            }`}>
              {userRole === 'teacher' ? <GraduationCap size={15} /> : displayUserName.slice(0, 2)}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-white truncate">{displayUserName}</p>
              <p className="text-[10px] text-gray-400 truncate">{currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="ログアウト"
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-[#333] rounded transition"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex-1 flex flex-col bg-[#1f1f1f]">
        {/* ヘッダー */}
        <div className="h-14 px-6 border-b border-[#2d2c2c] flex items-center justify-between bg-[#242424]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Hash size={18} className="text-gray-400" />
              <h1 className="font-semibold text-sm">
                {activeChannel === 'general' ? '一般（講義連絡）' : '質問・相談'}
              </h1>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentTab('posts')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  currentTab === 'posts' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                投稿
              </button>
              <button
                onClick={() => setCurrentTab('files')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  currentTab === 'files' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                ファイル
              </button>
              <button
                onClick={() => setCurrentTab('assignments')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  currentTab === 'assignments' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                課題
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>ロール: <strong className={userRole === 'teacher' ? 'text-amber-400' : 'text-indigo-400'}>
              {userRole === 'teacher' ? '教員' : '受講生'}
            </strong></span>
          </div>
        </div>

        {/* 投稿タブ */}
        {currentTab === 'posts' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {loading ? (
                <div className="text-center text-gray-500 text-sm mt-8">メッセージを読み込み中...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm mt-8">メッセージはまだありません。最初の投稿をしてみましょう！</div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.$id} className="flex gap-3 items-start group hover:bg-[#262626] p-2 rounded-md transition">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      msg.sender_role === 'teacher' ? 'bg-amber-600 text-white' : 'bg-indigo-600 text-white'
                    }`}>
                      {msg.sender_role === 'teacher' ? <GraduationCap size={16} /> : msg.sender_name.slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-xs text-white">{msg.sender_name}</span>
                        {msg.sender_role === 'teacher' && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">教員</span>
                        )}
                        <span className="text-[10px] text-gray-500">
                          {new Date(msg.$createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {renderMessageContent(msg.content)}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-[#242424] border-t border-[#2d2c2c]">
              {selectedFile && (
                <div className="mb-2 p-2 bg-[#1b1b1b] border border-indigo-500/50 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-indigo-300">
                    <Paperclip size={14} />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-gray-400 text-[10px]">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button 
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="bg-[#1f1f1f] rounded-lg border border-[#383838] focus-within:border-indigo-500 transition">
                <textarea
                  rows={2}
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={`#${activeChannel} にメッセージを送信... (Enterで送信, Shift+Enterで改行)`}
                  className="w-full bg-transparent p-3 text-sm text-white focus:outline-none resize-none placeholder-gray-500"
                />

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="px-3 py-2 flex items-center justify-between border-t border-[#2d2c2c] bg-[#222]">
                  <div className="flex items-center gap-3 text-gray-400">
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="hover:text-white transition"
                      title="ファイルを添付"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button type="button" className="hover:text-white transition"><Smile size={16} /></button>
                  </div>
                  <button
                    type="submit"
                    disabled={(!inputContent.trim() && !selectedFile) || uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-medium transition"
                  >
                    <Send size={13} />
                    <span>{uploading ? '送信中...' : '送信'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ファイル一覧タブ */}
        {currentTab === 'files' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FolderOpen size={20} className="text-indigo-400" />
                共有ファイル・配布物
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedFiles.map((file) => (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 bg-[#262626] border border-[#383838] rounded-lg hover:border-gray-500 transition block group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="text-indigo-400 shrink-0" size={24} />
                    <div className="overflow-hidden">
                      <h3 className="text-xs font-medium text-white truncate group-hover:text-indigo-300">{file.name}</h3>
                      <p className="text-[10px] text-gray-400">{file.date} • {file.size}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 課題タブ */}
        {currentTab === 'assignments' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <BookOpen size={20} className="text-indigo-400" />
                  課題一覧
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {userRole === 'teacher' ? '教員用：課題の作成・提出状況の確認が行えます' : '生徒用：課題の確認と提出が行えます（期日前なら取り下げ可能）'}
                </p>
              </div>

              {userRole === 'teacher' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition shadow"
                >
                  <PlusCircle size={16} />
                  新規課題を作成
                </button>
              )}
            </div>

            {showCreateModal && (
              <div className="mb-6 p-5 bg-[#252525] border border-[#3b3a39] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-3">新しい課題を作成</h3>
                <form onSubmit={handleCreateAssignment} className="space-y-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">課題タイトル</label>
                    <input
                      type="text"
                      required
                      placeholder="例: 第4回 計算機システム課題"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 flex items-center gap-1.5 mb-1">
                      <Calendar size={13} className="text-indigo-400" />
                      提出期限（カレンダーから選択）
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className="w-full bg-[#1e1e1e] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">詳細・指示内容</label>
                    <textarea
                      rows={2}
                      placeholder="課題の要件や提出フォーマットを入力"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
                    >
                      公開する
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="space-y-4">
              {assignments.map((asg) => {
                const mySubmission = asg.submissions.find((s) => s.studentName === displayUserName);
                const isSubmitted = !!mySubmission;
                const isPastDue = new Date().getTime() > new Date(asg.dueDate).getTime();

                return (
                  <div key={asg.id} className="p-5 bg-[#252526] border border-[#383838] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-medium">
                          #{asg.channel}
                        </span>
                        <h3 className="text-sm font-semibold text-white mt-1">{asg.title}</h3>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded ${
                        isPastDue ? 'bg-red-950/40 text-red-300 border border-red-500/30' : 'bg-[#1f1f1f] text-gray-300 border border-gray-700'
                      }`}>
                        <Clock size={14} className={isPastDue ? 'text-red-400' : 'text-amber-400'} />
                        <span>期限: {formatDateTime(asg.dueDate)}</span>
                        {isPastDue && <span className="text-[10px] font-bold text-red-400 ml-1">(期限切れ)</span>}
                      </div>
                    </div>

                    <p className="text-xs text-gray-300 mt-2.5 leading-relaxed bg-[#1d1d1d] p-3 rounded">
                      {asg.description}
                    </p>

                    {userRole === 'student' && (
                      <div className="mt-4 pt-4 border-t border-[#333]">
                        {isSubmitted ? (
                          <div className="bg-emerald-950/30 border border-emerald-500/40 p-3.5 rounded-md flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                                <span className="text-xs font-semibold text-emerald-300">
                                  提出済み（受付日時: {mySubmission.submittedAt}）
                                </span>
                              </div>

                              {!isPastDue ? (
                                <button
                                  onClick={() => handleCancelSubmission(asg.id, asg.dueDate, mySubmission.content)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-300 hover:text-white bg-[#2b2b2b] hover:bg-[#383838] border border-gray-600 rounded transition"
                                >
                                  <RotateCcw size={12} />
                                  提出を取り下げて編集
                                </button>
                              ) : (
                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                  <AlertCircle size={12} />
                                  期限後のため取り下げ不可
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-300 bg-[#191919] p-2.5 rounded border border-[#2e2e2e] leading-relaxed">
                              {mySubmission.content}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {isPastDue ? (
                              <div className="p-3 bg-red-950/20 border border-red-500/30 rounded text-xs text-red-400 flex items-center gap-2">
                                <AlertCircle size={16} />
                                提出期限を過ぎているため、この課題は新規提出できません。
                              </div>
                            ) : (
                              <>
                                <textarea
                                  rows={2}
                                  value={submissionText[asg.id] || ''}
                                  onChange={(e) => setSubmissionText({ ...submissionText, [asg.id]: e.target.value })}
                                  placeholder="提出レポートの内容、または成果物URLを入力..."
                                  className="w-full bg-[#1b1b1b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                                />
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleSubmitAssignment(asg.id, asg.dueDate)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition"
                                  >
                                    課題を提出する
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {userRole === 'teacher' && (
                      <div className="mt-4 pt-3 border-t border-[#333]">
                        <h4 className="text-xs font-semibold text-gray-300 mb-2">提出状況 ({asg.submissions.length} 件)</h4>
                        {asg.submissions.length === 0 ? (
                          <p className="text-[11px] text-gray-500">まだ提出された答案はありません。</p>
                        ) : (
                          <div className="space-y-1.5">
                            {asg.submissions.map((sub, idx) => (
                              <div key={idx} className="p-2.5 bg-[#1e1e1e] rounded text-xs flex justify-between items-start border border-[#333]">
                                <div>
                                  <span className="font-semibold text-white">{sub.studentName}</span>
                                  <span className="text-[10px] text-gray-500 ml-2">{sub.submittedAt}</span>
                                  <p className="text-gray-300 mt-1">{sub.content}</p>
                                </div>
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  提出完了
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
