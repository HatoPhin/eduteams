import React, { useState, useEffect, useRef } from 'react';
import { ID, Query } from 'appwrite';
import type { Models } from 'appwrite';
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
  Lock, 
  Mail, 
  ShieldCheck,
  Settings,
  Edit2,
  Trash2,
  Check,
  Plus
} from 'lucide-react';

interface UserPrefs extends Models.Preferences {
  role?: 'student' | 'teacher';
}

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

interface ChannelItem {
  id: string;
  name: string;
  description: string;
}

interface Submission {
  studentName: string;
  submittedAt: string;
  content: string;
  score?: string;
  feedback?: string;
}

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  description: string;
  channel: string;
  submissions: Submission[];
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<Models.User<UserPrefs> | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // ナビゲーション
  const [currentNav, setCurrentNav] = useState<'chat' | 'teams' | 'assignments'>('teams');
  const [currentTab, setCurrentTab] = useState<'posts' | 'files' | 'assignments' | 'settings'>('posts');
  
  // チーム・チャンネル
  const [teamName, setTeamName] = useState('情報通信工学 演習クラス');
  const [channels, setChannels] = useState<ChannelItem[]>([
    { id: 'general', name: '一般（講義連絡）', description: '講義全体の連絡・お知らせ' },
    { id: 'questions', name: '質問・相談', description: '課題や講義内容に関する質疑応答' },
    { id: 'lab', name: '演習・実験実習', description: '環境構築や演習の進行' }
  ]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);

  // チャット
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ファイル
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
  
  // 課題作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAsgChannel, setNewAsgChannel] = useState('general');

  // 課題編集モーダル
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // 提出物評価ステート (教員用: studentName-asgId をキーにする)
  const [gradingState, setGradingState] = useState<{ [key: string]: { score: string; feedback: string } }>({});

  useEffect(() => {
    checkLoggedInUser();
  }, []);

  const checkLoggedInUser = async () => {
    try {
      setAuthLoading(true);
      const user = await account.get<UserPrefs>();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await account.createEmailPasswordSession(authEmail, authPassword);
      await checkLoggedInUser();
    } catch (err: any) {
      setAuthError(err.message || 'ログインに失敗しました。');
    }
  };

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

  const userRole: 'student' | 'teacher' = currentUser?.prefs?.role === 'teacher' ? 'teacher' : 'student';
  const displayUserName = currentUser?.name || '受講生';

  // メッセージ購読
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

  // メッセージ送信
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

  // 課題作成 (教員)
  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate.trim()) return;

    const newAssignment: Assignment = {
      id: `asg-${Date.now()}`,
      title: newTitle,
      dueDate: newDueDate,
      description: newDesc,
      channel: newAsgChannel,
      submissions: []
    };

    setAssignments((prev) => [newAssignment, ...prev]);
    setNewTitle('');
    setNewDueDate('');
    setNewDesc('');
    setShowCreateModal(false);
  };

  // 課題編集保存 (教員)
  const handleSaveEditAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;

    setAssignments((prev) =>
      prev.map((asg) => (asg.id === editingAssignment.id ? editingAssignment : asg))
    );
    setEditingAssignment(null);
  };

  // 課題削除 (教員)
  const handleDeleteAssignment = (id: string, title: string) => {
    if (!confirm(`課題「${title}」を削除しますか？\n提出データもすべて失われます。`)) return;
    setAssignments((prev) => prev.filter((asg) => asg.id !== id));
  };

  // 課題提出 (生徒)
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

  // 提出取り下げ (生徒)
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

  // 採点とフィードバック登録 (教員)
  const handleGradeSubmission = (asgId: string, studentName: string) => {
    const key = `${asgId}-${studentName}`;
    const grade = gradingState[key];
    if (!grade) return;

    setAssignments((prev) =>
      prev.map((asg) => {
        if (asg.id === asgId) {
          return {
            ...asg,
            submissions: asg.submissions.map((sub) => {
              if (sub.studentName === studentName) {
                return {
                  ...sub,
                  score: grade.score || sub.score,
                  feedback: grade.feedback || sub.feedback
                };
              }
              return sub;
            })
          };
        }
        return asg;
      })
    );
    alert(`${studentName} さんの評価を保存しました。`);
  };

  // チャンネル作成 (教員)
  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const id = newChannelName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newChan: ChannelItem = {
      id: id || `chan-${Date.now()}`,
      name: newChannelName.trim(),
      description: newChannelDesc.trim() || 'チャンネルの説明はありません'
    };

    setChannels((prev) => [...prev, newChan]);
    setNewChannelName('');
    setNewChannelDesc('');
    setShowAddChannelModal(false);
  };

  // チャンネル削除 (教員)
  const handleDeleteChannel = (id: string, name: string) => {
    if (channels.length <= 1) {
      alert('チャンネルをすべて削除することはできません。');
      return;
    }
    if (!confirm(`チャンネル「#${name}」を削除しますか？`)) return;

    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (activeChannel === id) {
      setActiveChannel(channels[0].id === id ? channels[1].id : channels[0].id);
    }
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

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1f1f1f] text-gray-300">
        <div className="text-sm flex items-center gap-2">
          <Clock className="animate-spin text-indigo-400" size={18} />
          認証情報を確認中...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#18181b] text-gray-200 font-sans p-4">
        <div className="w-full max-w-md bg-[#242427] border border-[#3f3f46] rounded-xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-lg mb-3">
              ET
            </div>
            <h1 className="text-lg font-bold tracking-wide text-white">EduTeams ログイン</h1>
            <p className="text-xs text-gray-400 mt-1">関係者専用コラボレーション環境</p>
          </div>

          <div className="mb-5 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-lg flex items-start gap-2.5 text-xs text-indigo-200">
            <ShieldCheck size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <span>このシステムは招待制です。管理者より発行されたアカウント情報でサインインしてください。</span>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs leading-relaxed">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">メールアドレス</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="email"
                  required
                  placeholder="name@univ.ac.jp"
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
                  placeholder="••••••••"
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
              サインイン
            </button>
          </form>
        </div>
      </div>
    );
  }

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

      {/* 左サイドバー：チーム＆チャンネル一覧 */}
      <div className="w-64 bg-[#2b2b2b] flex flex-col border-r border-[#383838] shrink-0">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#383838]">
          <span className="font-semibold text-sm tracking-wide truncate" title={teamName}>
            {teamName}
          </span>
          {userRole === 'teacher' && (
            <button
              onClick={() => setShowAddChannelModal(true)}
              className="text-gray-400 hover:text-white p-1 rounded"
              title="チャンネルを追加"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        <div className="p-3 flex flex-col gap-1 overflow-y-auto flex-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-gray-400">チャネル</span>
          </div>
          {channels.map((chan) => (
            <div
              key={chan.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                activeChannel === chan.id ? 'bg-[#3b3a39] text-white' : 'text-gray-300 hover:bg-[#333333]'
              }`}
              onClick={() => setActiveChannel(chan.id)}
            >
              <div className="flex items-center gap-2 truncate">
                <Hash size={16} className="shrink-0 text-gray-400" />
                <span className="truncate">{chan.name}</span>
              </div>
              {userRole === 'teacher' && channels.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChannel(chan.id, chan.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition p-0.5"
                  title="チャンネル削除"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ユーザーアカウント & ログアウト */}
        <div className="p-3 border-t border-[#383838] bg-[#242424] flex items-center justify-between">
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
                {channels.find((c) => c.id === activeChannel)?.name || activeChannel}
              </h1>
            </div>

            {/* 上部タブ */}
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

              {/* 教員専用タブ：管理設定 */}
              {userRole === 'teacher' && (
                <button
                  onClick={() => setCurrentTab('settings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    currentTab === 'settings' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-400 hover:text-amber-200'
                  }`}
                >
                  <Settings size={13} />
                  管理設定
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>ロール: <strong className={userRole === 'teacher' ? 'text-amber-400' : 'text-indigo-400'}>
              {userRole === 'teacher' ? '教員（全権限管理者）' : '受講生'}
            </strong></span>
          </div>
        </div>

        {/* 1. 投稿タブ */}
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
                  placeholder={`#${channels.find(c => c.id === activeChannel)?.name || activeChannel} にメッセージを送信...`}
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

        {/* 2. ファイルタブ */}
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

        {/* 3. 課題タブ */}
        {currentTab === 'assignments' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <BookOpen size={20} className="text-indigo-400" />
                  課題一覧
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {userRole === 'teacher' ? '教員用：課題の作成・編集・削除、提出物の採点が行えます' : '生徒用：課題の確認、提出および期限前の取り下げが行えます'}
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

            {/* 新規課題作成モーダル */}
            {showCreateModal && (
              <div className="mb-6 p-5 bg-[#252525] border border-[#3b3a39] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-3">新しい課題を作成</h3>
                <form onSubmit={handleCreateAssignment} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
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
                      <label className="text-[11px] text-gray-400 block mb-1">対象チャンネル</label>
                      <select
                        value={newAsgChannel}
                        onChange={(e) => setNewAsgChannel(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>#{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 flex items-center gap-1.5 mb-1">
                      <Calendar size={13} className="text-indigo-400" />
                      提出期限
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

            {/* 課題編集モーダル */}
            {editingAssignment && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="w-full max-w-lg bg-[#242427] border border-[#3f3f46] rounded-xl p-6 shadow-2xl">
                  <h3 className="text-sm font-semibold text-white mb-4">課題の編集</h3>
                  <form onSubmit={handleSaveEditAssignment} className="space-y-3">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">タイトル</label>
                      <input
                        type="text"
                        required
                        value={editingAssignment.title}
                        onChange={(e) => setEditingAssignment({ ...editingAssignment, title: e.target.value })}
                        className="w-full bg-[#18181b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">提出期限</label>
                      <input
                        type="datetime-local"
                        required
                        value={editingAssignment.dueDate}
                        onChange={(e) => setEditingAssignment({ ...editingAssignment, dueDate: e.target.value })}
                        style={{ colorScheme: 'dark' }}
                        className="w-full bg-[#18181b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">詳細説明</label>
                      <textarea
                        rows={3}
                        value={editingAssignment.description}
                        onChange={(e) => setEditingAssignment({ ...editingAssignment, description: e.target.value })}
                        className="w-full bg-[#18181b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingAssignment(null)}
                        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
                      >
                        変更を保存
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* 課題カード一覧 */}
            <div className="space-y-4">
              {assignments.map((asg) => {
                const mySubmission = asg.submissions.find((s) => s.studentName === displayUserName);
                const isSubmitted = !!mySubmission;
                const isPastDue = new Date().getTime() > new Date(asg.dueDate).getTime();

                return (
                  <div key={asg.id} className="p-5 bg-[#252526] border border-[#383838] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-medium">
                            #{channels.find(c => c.id === asg.channel)?.name || asg.channel}
                          </span>
                          {userRole === 'teacher' && (
                            <div className="flex items-center gap-1.5 ml-2">
                              <button
                                onClick={() => setEditingAssignment(asg)}
                                className="text-gray-400 hover:text-white transition p-1"
                                title="課題を編集"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(asg.id, asg.title)}
                                className="text-gray-400 hover:text-red-400 transition p-1"
                                title="課題を削除"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
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

                    {/* 生徒視点：提出 & 取り下げ & 採点確認 */}
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

                            {/* 教員からの評価・採点がある場合 */}
                            {(mySubmission.score || mySubmission.feedback) && (
                              <div className="mt-2 p-2.5 bg-[#202020] border border-amber-500/40 rounded text-xs">
                                <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                                  <GraduationCap size={15} />
                                  教員からの評価: {mySubmission.score ? `${mySubmission.score} 点` : '評価済み'}
                                </div>
                                {mySubmission.feedback && (
                                  <p className="text-gray-300">{mySubmission.feedback}</p>
                                )}
                              </div>
                            )}
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

                    {/* 教員視点：提出者一覧 & 採点・フィードバック */}
                    {userRole === 'teacher' && (
                      <div className="mt-4 pt-3 border-t border-[#333]">
                        <h4 className="text-xs font-semibold text-gray-300 mb-2">提出状況 ({asg.submissions.length} 件)</h4>
                        {asg.submissions.length === 0 ? (
                          <p className="text-[11px] text-gray-500">まだ提出された答案はありません。</p>
                        ) : (
                          <div className="space-y-2">
                            {asg.submissions.map((sub, idx) => {
                              const key = `${asg.id}-${sub.studentName}`;
                              return (
                                <div key={idx} className="p-3 bg-[#1e1e1e] rounded text-xs border border-[#333] space-y-2">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="font-semibold text-white">{sub.studentName}</span>
                                      <span className="text-[10px] text-gray-500 ml-2">{sub.submittedAt}</span>
                                      <p className="text-gray-300 mt-1 bg-[#161616] p-2 rounded">{sub.content}</p>
                                    </div>
                                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                      提出済
                                    </span>
                                  </div>

                                  {/* 採点入力欄 */}
                                  <div className="pt-2 border-t border-[#2a2a2a] flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="点数 (例: 90)"
                                      defaultValue={sub.score || ''}
                                      onChange={(e) =>
                                        setGradingState((prev) => ({
                                          ...prev,
                                          [key]: { ...prev[key], score: e.target.value, feedback: prev[key]?.feedback || sub.feedback || '' }
                                        }))
                                      }
                                      className="w-24 bg-[#141414] border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder="講評・フィードバック"
                                      defaultValue={sub.feedback || ''}
                                      onChange={(e) =>
                                        setGradingState((prev) => ({
                                          ...prev,
                                          [key]: { ...prev[key], feedback: e.target.value, score: prev[key]?.score || sub.score || '' }
                                        }))
                                      }
                                      className="flex-1 bg-[#141414] border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                    <button
                                      onClick={() => handleGradeSubmission(asg.id, sub.studentName)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] rounded transition flex items-center gap-1"
                                    >
                                      <Check size={12} />
                                      保存
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
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

        {/* 4. 教員専用タブ：管理設定 */}
        {currentTab === 'settings' && userRole === 'teacher' && (
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-amber-400" />
                クラスルーム総合管理設定
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                チームの名称変更、チャンネルの作成・削除、全課題の一括管理を行います。
              </p>
            </div>

            {/* チーム基本設定 */}
            <div className="p-5 bg-[#252526] border border-[#383838] rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-3">チームの基本情報</h3>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="flex-1 max-w-md bg-[#1b1b1b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => alert('チーム名を更新しました。')}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition"
                >
                  名称を更新
                </button>
              </div>
            </div>

            {/* チャンネル管理 */}
            <div className="p-5 bg-[#252526] border border-[#383838] rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">チャンネル一覧の管理</h3>
                <button
                  onClick={() => setShowAddChannelModal(true)}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition flex items-center gap-1"
                >
                  <Plus size={14} />
                  新規チャンネル追加
                </button>
              </div>

              <div className="space-y-2">
                {channels.map((chan) => (
                  <div key={chan.id} className="p-3 bg-[#1e1e1e] rounded flex items-center justify-between border border-[#333]">
                    <div>
                      <span className="font-semibold text-xs text-white">#{chan.name}</span>
                      <p className="text-[11px] text-gray-400">{chan.description}</p>
                    </div>
                    {channels.length > 1 && (
                      <button
                        onClick={() => handleDeleteChannel(chan.id, chan.name)}
                        className="text-gray-400 hover:text-red-400 p-1.5 rounded transition"
                        title="チャンネルを削除"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 全課題サマリー */}
            <div className="p-5 bg-[#252526] border border-[#383838] rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-3">全課題の集計サマリー</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-[#1e1e1e] rounded border border-[#333]">
                  <p className="text-[11px] text-gray-400">公開中課題数</p>
                  <p className="text-xl font-bold text-white mt-1">{assignments.length}</p>
                </div>
                <div className="p-3 bg-[#1e1e1e] rounded border border-[#333]">
                  <p className="text-[11px] text-gray-400">総提出件数</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    {assignments.reduce((acc, cur) => acc + cur.submissions.length, 0)}
                  </p>
                </div>
                <div className="p-3 bg-[#1e1e1e] rounded border border-[#333]">
                  <p className="text-[11px] text-gray-400">参加チャンネル数</p>
                  <p className="text-xl font-bold text-indigo-400 mt-1">{channels.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* チャンネル新規追加モーダル */}
      {showAddChannelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-[#242427] border border-[#3f3f46] rounded-xl p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">新規チャンネルを作成</h3>
            <form onSubmit={handleAddChannel} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">チャンネル名</label>
                <input
                  type="text"
                  required
                  placeholder="例: 期末演習プロジェクト"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full bg-[#18181b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">説明（任意）</label>
                <input
                  type="text"
                  placeholder="チャンネルの目的を入力"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="w-full bg-[#18181b] border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddChannelModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
