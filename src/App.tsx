import React, { useState, useEffect, useRef } from 'react';
import { ID, Query } from 'appwrite';
import type { Models } from 'appwrite';
import FileAttachment from './FileAttachment';
import { 
  client, 
  databases, 
  storage,
  account,
  DB_ID, 
  MESSAGES_COLLECTION_ID,
  STORAGE_BUCKET_ID,
  CHANNELS_COLLECTION_ID,
  ASSIGNMENTS_COLLECTION_ID
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

interface SubFile {
  id: string;
  name: string;
  url: string;
}

interface Submission {
  studentName: string;
  submittedAt: string;
  content: string;
  files?: SubFile[];
  score?: string;
  feedback?: string;
}

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  description: string;
  channel: string;
  attachmentName?: string;
  attachmentUrl?: string;
  submissions: Submission[];
}

// チーム名などの共通設定 (Appwriteのテーブルid「settings」、行id「team」)
const SETTINGS_COLLECTION_ID = 'settings';
const TEAM_DOC_ID = 'team';

// 初回セットアップ時に作る最初のチャンネル (あとから名前変更・追加が可能)
const FIRST_CHANNEL = { name: '一般', description: '講義全体の連絡・お知らせ' };

const parseSubmissions = (raw: unknown): Submission[] => {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    return JSON.parse(raw) as Submission[];
  } catch {
    return [];
  }
};

const sortDocs = (docs: any[]) =>
  [...docs].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
  );

const toChannel = (d: any): ChannelItem => ({
  id: d.$id,
  name: d.name,
  description: d.description || ''
});

const toAssignment = (d: any): Assignment => ({
  id: d.$id,
  title: d.title,
  dueDate: d.dueDate,
  description: d.description || '',
  channel: d.channelId || '',
  attachmentName: d.attachmentName || undefined,
  attachmentUrl: d.attachmentUrl || undefined,
  submissions: parseSubmissions(d.submissions)
});

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
  const [teamName, setTeamName] = useState('');
  const [teamNameDraft, setTeamNameDraft] = useState('');
  // チームの作成状況: loading=確認中 / none=未作成(初回) / ready=作成済み / error=読み込み失敗
  const [teamStatus, setTeamStatus] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [teamError, setTeamError] = useState('');
  const [setupName, setSetupName] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannel, setActiveChannel] = useState('');
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissionText, setSubmissionText] = useState<{ [key: string]: string }>({});
  const [submissionFiles, setSubmissionFiles] = useState<{ [key: string]: File[] }>({});
  const [submissionKept, setSubmissionKept] = useState<{ [key: string]: SubFile[] }>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  
  // 課題作成モーダル用ステート
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAsgChannel, setNewAsgChannel] = useState('');
  const [newAsgFile, setNewAsgFile] = useState<File | null>(null);
  const [asgUploading, setAsgUploading] = useState(false);
  const asgFileInputRef = useRef<HTMLInputElement>(null);

  // 課題編集モーダル用ステート
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editAsgFile, setEditAsgFile] = useState<File | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // 提出物評価ステート
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
      setTeamStatus('loading');
    } catch (err) {
      console.error('ログアウトエラー:', err);
    }
  };

  const userRole: 'student' | 'teacher' = currentUser?.prefs?.role === 'teacher' ? 'teacher' : 'student';
  const displayUserName = currentUser?.name || '受講生';

  // チャンネル・課題の読み込み (Appwrite)
  const loadChannels = async () => {
    try {
      const res = await databases.listDocuments(DB_ID, CHANNELS_COLLECTION_ID, [Query.limit(100)]);
      setChannels(sortDocs(res.documents).map(toChannel));
    } catch (err) {
      console.error('チャンネル取得エラー:', err);
    }
  };

  const loadTeamName = async () => {
    try {
      const d: any = await databases.getDocument(DB_ID, SETTINGS_COLLECTION_ID, TEAM_DOC_ID);
      if (d.teamName) {
        setTeamName(d.teamName);
        setTeamNameDraft(d.teamName);
        setTeamStatus('ready');
      } else {
        setTeamName('');
        setTeamStatus('none');
      }
    } catch (err: any) {
      const type = String(err?.type || '');
      // 「行が無い」場合だけが未作成。テーブルが無い・権限なしなどは別扱いにする
      if (err?.code === 404 && /document|row/.test(type)) {
        setTeamName('');
        setTeamStatus('none');
      } else {
        console.error('チーム情報取得エラー:', err);
        setTeamError(err?.message || '不明なエラー');
        setTeamStatus('error');
      }
    }
  };

  // 保存(新規作成も兼ねる)
  const saveTeamName = async (name: string) => {
    try {
      await databases.updateDocument(DB_ID, SETTINGS_COLLECTION_ID, TEAM_DOC_ID, { teamName: name });
    } catch (err: any) {
      if (err?.code === 404 && /document|row/.test(String(err?.type || ''))) {
        await databases.createDocument(DB_ID, SETTINGS_COLLECTION_ID, TEAM_DOC_ID, { teamName: name });
      } else {
        throw err;
      }
    }
  };

  const handleSaveTeamName = async () => {
    const name = teamNameDraft.trim();
    if (!name) {
      alert('チーム名を入力してください。');
      return;
    }
    try {
      await saveTeamName(name);
      setTeamName(name);
      alert('チーム名を更新しました。');
    } catch (err) {
      console.error('チーム名保存エラー:', err);
      alert('チーム名の保存に失敗しました。');
    }
  };

  // 初回セットアップ (管理者がチームを作成)
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = setupName.trim();
    if (!name) return;

    setSetupBusy(true);
    try {
      await saveTeamName(name);
      // チャンネルが1つも無いときだけ、最初のチャンネルを作る
      const existing = await databases.listDocuments(DB_ID, CHANNELS_COLLECTION_ID, [Query.limit(1)]);
      if (existing.documents.length === 0) {
        await databases.createDocument(DB_ID, CHANNELS_COLLECTION_ID, ID.unique(), {
          ...FIRST_CHANNEL,
          order: 0
        });
      }
      setTeamName(name);
      setTeamNameDraft(name);
      setTeamStatus('ready');
      setCurrentNav('teams');
      setCurrentTab('posts');
      await loadChannels();
    } catch (err) {
      console.error('チーム作成エラー:', err);
      alert('チームの作成に失敗しました。Appwrite の settings テーブルと権限を確認してください。');
    } finally {
      setSetupBusy(false);
    }
  };

  const loadAssignments = async () => {
    try {
      const res = await databases.listDocuments(DB_ID, ASSIGNMENTS_COLLECTION_ID, [Query.limit(100)]);
      const list = res.documents.map(toAssignment);
      list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      setAssignments(list);
    } catch (err) {
      console.error('課題取得エラー:', err);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadChannels();
    loadAssignments();
    loadTeamName();

    const unsubChannels = client.subscribe(
      `databases.${DB_ID}.collections.${CHANNELS_COLLECTION_ID}.documents`,
      () => { loadChannels(); }
    );
    const unsubAssignments = client.subscribe(
      `databases.${DB_ID}.collections.${ASSIGNMENTS_COLLECTION_ID}.documents`,
      () => { loadAssignments(); }
    );

    const unsubSettings = client.subscribe(
      `databases.${DB_ID}.collections.${SETTINGS_COLLECTION_ID}.documents`,
      () => { loadTeamName(); }
    );

    return () => {
      unsubChannels();
      unsubAssignments();
      unsubSettings();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // 選択中チャンネルが存在しない場合は先頭チャンネルへ
  useEffect(() => {
    if (channels.length > 0 && !channels.some((c) => c.id === activeChannel)) {
      setActiveChannel(channels[0].id);
    }
  }, [channels, activeChannel]);

  // メッセージ購読
  useEffect(() => {
    if (!currentUser || !activeChannel) return;
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

  // 提出物(JSON)の更新: 直前に最新を取得して書き込み、同時更新の取りこぼしを減らす
  const mutateSubmissions = async (id: string, fn: (subs: Submission[]) => Submission[]) => {
    const fresh = await databases.getDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id);
    const next = fn(parseSubmissions((fresh as any).submissions));
    await databases.updateDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id, {
      submissions: JSON.stringify(next)
    });
    await loadAssignments();
  };

  // 課題作成 (教員・ファイル添付対応)
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate.trim()) return;

    setAsgUploading(true);
    let attachedName: string | undefined = undefined;
    let attachedUrl: string | undefined = undefined;

    try {
      if (newAsgFile) {
        const uploaded = await storage.createFile(
          STORAGE_BUCKET_ID,
          ID.unique(),
          newAsgFile
        );
        attachedName = newAsgFile.name;
        attachedUrl = storage.getFileDownload(STORAGE_BUCKET_ID, uploaded.$id).toString();

        // 共有ファイルタブにも配布資料として自動追加
        setSharedFiles((prev) => [
          {
            id: uploaded.$id,
            name: `[課題配布] ${newAsgFile.name}`,
            url: attachedUrl!,
            size: `${(newAsgFile.size / 1024 / 1024).toFixed(2)} MB`,
            date: new Date().toLocaleDateString('ja-JP')
          },
          ...prev
        ]);
      }

      await databases.createDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, ID.unique(), {
        title: newTitle,
        dueDate: newDueDate,
        description: newDesc,
        channelId: newAsgChannel || activeChannel,
        attachmentName: attachedName ?? '',
        attachmentUrl: attachedUrl ?? '',
        attachmentIds: [],
        submissions: '[]',
        createdBy: currentUser?.$id ?? ''
      });
      await loadAssignments();

      setNewTitle('');
      setNewDueDate('');
      setNewDesc('');
      setNewAsgFile(null);
      if (asgFileInputRef.current) asgFileInputRef.current.value = '';
      setShowCreateModal(false);
    } catch (err) {
      console.error('課題作成・ファイルアップロードエラー:', err);
      alert('課題の作成に失敗しました。');
    } finally {
      setAsgUploading(false);
    }
  };

  // 課題編集保存 (教員)
  const handleSaveEditAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;

    let attachedName = editingAssignment.attachmentName;
    let attachedUrl = editingAssignment.attachmentUrl;

    try {
      if (editAsgFile) {
        const uploaded = await storage.createFile(
          STORAGE_BUCKET_ID,
          ID.unique(),
          editAsgFile
        );
        attachedName = editAsgFile.name;
        attachedUrl = storage.getFileDownload(STORAGE_BUCKET_ID, uploaded.$id).toString();
      }

      // submissions は上書きしない (生徒の提出を消さないため)
      await databases.updateDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, editingAssignment.id, {
        title: editingAssignment.title,
        dueDate: editingAssignment.dueDate,
        description: editingAssignment.description,
        channelId: editingAssignment.channel,
        attachmentName: attachedName ?? '',
        attachmentUrl: attachedUrl ?? ''
      });
      await loadAssignments();
      setEditingAssignment(null);
      setEditAsgFile(null);
    } catch (err) {
      console.error('課題編集エラー:', err);
      alert('課題の更新に失敗しました。');
    }
  };

  // 課題削除 (教員)
  const handleDeleteAssignment = async (id: string, title: string) => {
    if (!confirm(`課題「${title}」を削除しますか？\n提出データもすべて失われます。`)) return;
    try {
      await databases.deleteDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id);
      await loadAssignments();
    } catch (err) {
      console.error('課題削除エラー:', err);
      alert('課題の削除に失敗しました。');
    }
  };

  // 課題提出 (生徒・ファイル添付対応)
  const handleSubmitAssignment = async (assignmentId: string, dueDate: string) => {
    if (new Date().getTime() > new Date(dueDate).getTime()) {
      alert('提出期限を過ぎているため提出できません。');
      return;
    }

    const text = (submissionText[assignmentId] || '').trim();
    const pending = submissionFiles[assignmentId] || [];
    const kept = submissionKept[assignmentId] || [];
    if (!text && pending.length === 0 && kept.length === 0) {
      alert('提出内容を入力するか、ファイルを添付してください。');
      return;
    }

    setSubmittingId(assignmentId);
    try {
      const uploaded: SubFile[] = [];
      for (const file of pending) {
        const up = await storage.createFile(STORAGE_BUCKET_ID, ID.unique(), file);
        uploaded.push({
          id: up.$id,
          name: file.name,
          url: storage.getFileDownload(STORAGE_BUCKET_ID, up.$id).toString()
        });
      }
      const files = [...kept, ...uploaded];

      await mutateSubmissions(assignmentId, (subs) => [
        ...subs.filter((s) => s.studentName !== displayUserName),
        {
          studentName: displayUserName,
          submittedAt: new Date().toLocaleString('ja-JP', { hour12: false }),
          content: text,
          ...(files.length > 0 && { files })
        }
      ]);
      setSubmissionText((prev) => ({ ...prev, [assignmentId]: '' }));
      setSubmissionFiles((prev) => ({ ...prev, [assignmentId]: [] }));
      setSubmissionKept((prev) => ({ ...prev, [assignmentId]: [] }));
      alert('課題を提出しました！');
    } catch (err) {
      console.error('提出エラー:', err);
      alert('課題の提出に失敗しました。');
    } finally {
      setSubmittingId(null);
    }
  };

  // 提出取り下げ (生徒)
  const handleCancelSubmission = async (
    assignmentId: string,
    dueDate: string,
    previousContent: string,
    previousFiles: SubFile[] = []
  ) => {
    if (new Date().getTime() > new Date(dueDate).getTime()) {
      alert('提出期限を過ぎているため取り下げはできません。');
      return;
    }

    if (!confirm('提出を取り下げて編集し直しますか？')) return;

    try {
      await mutateSubmissions(assignmentId, (subs) =>
        subs.filter((s) => s.studentName !== displayUserName)
      );
      setSubmissionText((prev) => ({ ...prev, [assignmentId]: previousContent }));
      setSubmissionKept((prev) => ({ ...prev, [assignmentId]: previousFiles }));
    } catch (err) {
      console.error('取り下げエラー:', err);
      alert('取り下げに失敗しました。');
    }
  };

  // 採点とフィードバック登録 (教員)
  const handleGradeSubmission = async (asgId: string, studentName: string) => {
    const key = `${asgId}-${studentName}`;
    const grade = gradingState[key];
    if (!grade) return;

    try {
      await mutateSubmissions(asgId, (subs) =>
        subs.map((sub) =>
          sub.studentName === studentName
            ? {
                ...sub,
                score: grade.score || sub.score,
                feedback: grade.feedback || sub.feedback
              }
            : sub
        )
      );
      alert(`${studentName} さんの評価を保存しました。`);
    } catch (err) {
      console.error('採点エラー:', err);
      alert('評価の保存に失敗しました。');
    }
  };

  // チャンネル作成 (教員)
  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    try {
      await databases.createDocument(DB_ID, CHANNELS_COLLECTION_ID, ID.unique(), {
        name: newChannelName.trim(),
        description: newChannelDesc.trim() || 'チャンネルの説明はありません',
        order: channels.length
      });
      await loadChannels();
      setNewChannelName('');
      setNewChannelDesc('');
      setShowAddChannelModal(false);
    } catch (err) {
      console.error('チャンネル作成エラー:', err);
      alert('チャンネルの作成に失敗しました。');
    }
  };

  // チャンネル削除 (教員)
  const handleDeleteChannel = async (id: string, name: string) => {
    if (channels.length <= 1) {
      alert('チャンネルをすべて削除することはできません。');
      return;
    }
    if (!confirm(`チャンネル「#${name}」を削除しますか？`)) return;

    try {
      const next = channels.find((c) => c.id !== id);
      await databases.deleteDocument(DB_ID, CHANNELS_COLLECTION_ID, id);
      if (activeChannel === id && next) setActiveChannel(next.id);
      await loadChannels();
    } catch (err) {
      console.error('チャンネル削除エラー:', err);
      alert('チャンネルの削除に失敗しました。');
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
      parts.push(<FileAttachment key={match.index} name={fileName} url={fileUrl} />);
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
        <div className="text-sm flex items-center gap-2 animate-pulse">
          <Clock className="animate-spin text-indigo-400" size={18} />
          認証情報を確認中...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#18181b] text-gray-200 font-sans p-4">
        <div className="w-full max-w-md bg-[#242427] border border-[#3f3f46] rounded-xl p-8 shadow-2xl transition-all duration-300 transform scale-100">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-bold text-white text-xl shadow-lg mb-3">
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
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs leading-relaxed animate-fade-in">
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
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
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
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white text-xs font-semibold rounded-lg transition-all duration-150 shadow-md mt-2"
            >
              サインイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  // チーム未作成・確認中・読み込み失敗の画面
  if (teamStatus !== 'ready') {
    const shell = (children: React.ReactNode) => (
      <div className="flex h-screen items-center justify-center bg-[#18181b] text-gray-200 font-sans p-4">
        <div className="w-full max-w-md bg-[#242427] border border-[#3f3f46] rounded-xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-bold text-white text-xl shadow-lg mb-3">
              ET
            </div>
          </div>
          {children}
          <button
            onClick={handleLogout}
            className="mt-5 w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={12} />
            ログアウト
          </button>
        </div>
      </div>
    );

    if (teamStatus === 'loading') {
      return (
        <div className="flex h-screen items-center justify-center bg-[#18181b] text-gray-300">
          <div className="text-sm flex items-center gap-2 animate-pulse">
            <Clock className="animate-spin text-indigo-400" size={18} />
            チーム情報を確認中...
          </div>
        </div>
      );
    }

    if (teamStatus === 'error') {
      return shell(
        <>
          <h1 className="text-base font-bold text-white text-center">チーム情報を読み込めませんでした</h1>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Appwrite の <code className="text-indigo-300">settings</code> テーブルが存在するか、ログイン済みユーザーに Read 権限があるかを確認してください。
          </p>
          <p className="text-[11px] text-red-300 mt-3 bg-red-950/30 border border-red-500/30 rounded p-2 break-all">{teamError}</p>
          <button
            onClick={() => { setTeamStatus('loading'); loadTeamName(); }}
            className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            再読み込み
          </button>
        </>
      );
    }

    // teamStatus === 'none'
    if (userRole === 'teacher') {
      return shell(
        <>
          <h1 className="text-lg font-bold text-white text-center">EduTeams へようこそ</h1>
          <p className="text-xs text-gray-400 mt-2 text-center leading-relaxed">
            まだチームが作成されていません。<br />最初に、チームの名前を決めてください。
          </p>
          <form onSubmit={handleCreateTeam} className="mt-5 space-y-3">
            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">チーム名</label>
              <input
                type="text"
                required
                autoFocus
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                placeholder="例: ○○学 演習クラス"
                className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              「一般」チャンネルを1つ自動で作成します。チャンネルの追加や名前の変更は、あとから管理設定で行えます。
            </p>
            <button
              type="submit"
              disabled={setupBusy || !setupName.trim()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 text-white text-xs font-medium rounded-lg transition-all shadow"
            >
              {setupBusy ? '作成中...' : 'チームを作成して始める'}
            </button>
          </form>
        </>
      );
    }

    return shell(
      <>
        <h1 className="text-base font-bold text-white text-center">チームの準備中です</h1>
        <p className="text-xs text-gray-400 mt-3 text-center leading-relaxed">
          管理者(教員)がチームを作成すると、この画面が自動で切り替わります。<br />しばらくお待ちください。
        </p>
      </>
    );
  }

  return (
    <div className="flex h-screen bg-[#1f1f1f] text-gray-200 select-none font-sans overflow-hidden">
      {/* 最左端：アプリアイコンバー */}
      <div className="w-16 bg-[#201f1e] flex flex-col items-center py-4 border-r border-[#2d2c2c] gap-6 shrink-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md">
          ET
        </div>
        <div className="flex flex-col gap-4 text-gray-400">
          <button 
            onClick={() => { setCurrentNav('teams'); setCurrentTab('posts'); }}
            className={`flex flex-col items-center gap-1 transition-all duration-200 transform hover:scale-105 ${
              currentNav === 'teams' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <Users size={22} />
            <span className="text-[10px]">チーム</span>
          </button>
          <button 
            onClick={() => { setCurrentNav('chat'); setCurrentTab('posts'); }}
            className={`flex flex-col items-center gap-1 transition-all duration-200 transform hover:scale-105 ${
              currentNav === 'chat' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <MessageSquare size={22} />
            <span className="text-[10px]">チャット</span>
          </button>
          <button 
            onClick={() => { setCurrentNav('assignments'); setCurrentTab('assignments'); }}
            className={`flex flex-col items-center gap-1 transition-all duration-200 transform hover:scale-105 ${
              currentNav === 'assignments' ? 'text-indigo-400 font-bold' : 'hover:text-white'
            }`}
          >
            <BookOpen size={22} />
            <span className="text-[10px]">課題</span>
          </button>
        </div>
      </div>

      {/* 左サイドバー */}
      <div className="w-64 bg-[#2b2b2b] flex flex-col border-r border-[#383838] shrink-0">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#383838]">
          <span className="font-semibold text-sm tracking-wide truncate" title={teamName}>
            {teamName}
          </span>
          {userRole === 'teacher' && (
            <button
              onClick={() => setShowAddChannelModal(true)}
              className="text-gray-400 hover:text-white p-1.5 hover:bg-[#333] rounded transition-all duration-150 transform hover:rotate-90"
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
              className={`group flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                activeChannel === chan.id ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-300 hover:bg-[#333333]'
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
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-opacity p-0.5 rounded"
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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-transform hover:scale-105 ${
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
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-[#333] rounded transition-colors"
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  currentTab === 'posts' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                投稿
              </button>
              <button
                onClick={() => setCurrentTab('files')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  currentTab === 'files' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                ファイル
              </button>
              <button
                onClick={() => setCurrentTab('assignments')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  currentTab === 'assignments' ? 'bg-[#3b3a39] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                課題
              </button>

              {userRole === 'teacher' && (
                <button
                  onClick={() => setCurrentTab('settings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
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
          <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {loading ? (
                <div className="text-center text-gray-500 text-sm mt-8 animate-pulse">メッセージを読み込み中...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm mt-8">メッセージはまだありません。最初の投稿をしてみましょう！</div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.$id} className="flex gap-3 items-start group hover:bg-[#262626] p-2.5 rounded-lg transition-all duration-150">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
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
                <div className="mb-2 p-2 bg-[#1b1b1b] border border-indigo-500/50 rounded-lg flex items-center justify-between animate-fade-in shadow">
                  <div className="flex items-center gap-2 text-xs text-indigo-300">
                    <Paperclip size={14} />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-gray-400 text-[10px]">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button 
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-gray-400 hover:text-white p-1 rounded transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="bg-[#1f1f1f] rounded-lg border border-[#383838] focus-within:border-indigo-500 transition-colors shadow-sm">
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
                      className="hover:text-white transition-colors transform hover:scale-110"
                      title="ファイルを添付"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button type="button" className="hover:text-white transition-colors transform hover:scale-110"><Smile size={16} /></button>
                  </div>
                  <button
                    type="submit"
                    disabled={(!inputContent.trim() && !selectedFile) || uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-medium transition-all shadow"
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
          <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FolderOpen size={20} className="text-indigo-400" />
                共有ファイル・配布物
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedFiles.map((file) => (
                <div
                  key={file.id}
                  className="p-4 bg-[#262626] border border-[#383838] rounded-xl hover:border-indigo-500/50 hover:bg-[#2c2c2c] transition-all duration-200 space-y-1"
                >
                  <FileAttachment name={file.name} url={file.url} />
                  <p className="text-[10px] text-gray-400">{file.date} • {file.size}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 課題タブ */}
        {currentTab === 'assignments' && (
          <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <BookOpen size={20} className="text-indigo-400" />
                  課題一覧
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {userRole === 'teacher' ? '教員用：課題の作成・編集・削除、配布ファイルの添付、提出物の採点が行えます' : '生徒用：課題の確認、配布資料の参照、提出および期限前の取り下げが行えます'}
                </p>
              </div>

              {userRole === 'teacher' && (
                <button
                  onClick={() => { setNewAsgChannel(activeChannel); setShowCreateModal(true); }}
                  className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-indigo-500/20"
                >
                  <PlusCircle size={16} />
                  新規課題を作成
                </button>
              )}
            </div>

            {/* 新規課題作成モーダル（配布資料添付対応） */}
            {showCreateModal && (
              <div className="mb-6 p-6 bg-[#252525] border border-[#3b3a39] rounded-xl shadow-xl transition-all duration-200 animate-fade-in">
                <h3 className="text-sm font-semibold text-white mb-3">新しい課題を作成</h3>
                <form onSubmit={handleCreateAssignment} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">課題タイトル</label>
                      <input
                        type="text"
                        required
                        placeholder="例: 第4回 計算機システム課題"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">対象チャンネル</label>
                      <select
                        value={newAsgChannel}
                        onChange={(e) => setNewAsgChannel(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
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
                      className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">詳細・指示内容</label>
                    <textarea
                      rows={2}
                      placeholder="課題の要件や提出フォーマットを入力"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                    />
                  </div>

                  {/* 課題用 配布資料ファイル添付 */}
                  <div>
                    <label className="text-[11px] text-gray-400 flex items-center gap-1.5 mb-1">
                      <Paperclip size={13} className="text-indigo-400" />
                      配布資料・課題ファイル（PDF, Word, Excelなど）
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        ref={asgFileInputRef}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setNewAsgFile(e.target.files[0]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => asgFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#333] hover:bg-[#3d3d3d] text-gray-200 text-xs rounded-lg border border-gray-600 flex items-center gap-2 transition-all hover:scale-105"
                      >
                        <FolderOpen size={14} />
                        ファイルを選択
                      </button>
                      {newAsgFile ? (
                        <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-950/40 px-2.5 py-1 rounded-md border border-indigo-500/30">
                          <FileText size={13} />
                          <span>{newAsgFile.name}</span>
                          <span className="text-gray-400 text-[10px]">({(newAsgFile.size / 1024).toFixed(1)} KB)</span>
                          <button
                            type="button"
                            onClick={() => { setNewAsgFile(null); if (asgFileInputRef.current) asgFileInputRef.current.value = ''; }}
                            className="hover:text-white ml-1"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-500">選択されていません（任意）</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={asgUploading}
                      className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white rounded-lg font-medium transition-all shadow"
                    >
                      {asgUploading ? 'アップロード＆公開中...' : '公開する'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 課題編集モーダル（ポップアップ・アニメーション） */}
            {editingAssignment && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
                <div className="w-full max-w-lg bg-[#242427] border border-[#3f3f46] rounded-xl p-6 shadow-2xl transition-all duration-200 transform scale-100">
                  <h3 className="text-sm font-semibold text-white mb-4">課題の編集</h3>
                  <form onSubmit={handleSaveEditAssignment} className="space-y-3">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">タイトル</label>
                      <input
                        type="text"
                        required
                        value={editingAssignment.title}
                        onChange={(e) => setEditingAssignment({ ...editingAssignment, title: e.target.value })}
                        className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
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
                        className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">詳細説明</label>
                      <textarea
                        rows={3}
                        value={editingAssignment.description}
                        onChange={(e) => setEditingAssignment({ ...editingAssignment, description: e.target.value })}
                        className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                      />
                    </div>

                    {/* 配布ファイルの差し替え */}
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">配布資料ファイル</label>
                      {editingAssignment.attachmentName && !editAsgFile && (
                        <div className="flex items-center gap-2 mb-2 text-xs text-indigo-300 bg-indigo-950/30 p-2 rounded border border-indigo-500/30">
                          <FileText size={14} />
                          <span>現在: {editingAssignment.attachmentName}</span>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={editFileInputRef}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setEditAsgFile(e.target.files[0]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#333] hover:bg-[#3d3d3d] text-gray-200 text-xs rounded-lg border border-gray-600 flex items-center gap-2 transition-all hover:scale-105"
                      >
                        <FolderOpen size={14} />
                        新しいファイルを選択して差し替え
                      </button>
                      {editAsgFile && (
                        <span className="text-xs text-emerald-400 block mt-1">選択中: {editAsgFile.name}</span>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end pt-3">
                      <button
                        type="button"
                        onClick={() => { setEditingAssignment(null); setEditAsgFile(null); }}
                        className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg font-medium transition-all shadow"
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
                  <div key={asg.id} className="p-5 bg-[#252526] border border-[#383838] hover:border-gray-600 rounded-xl transition-all duration-200 transform hover:-translate-y-0.5 shadow-md">
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
                                className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                                title="課題を編集"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(asg.id, asg.title)}
                                className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded"
                                title="課題を削除"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-white mt-1">{asg.title}</h3>
                      </div>

                      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md ${
                        isPastDue ? 'bg-red-950/40 text-red-300 border border-red-500/30' : 'bg-[#1f1f1f] text-gray-300 border border-gray-700'
                      }`}>
                        <Clock size={14} className={isPastDue ? 'text-red-400' : 'text-amber-400'} />
                        <span>期限: {formatDateTime(asg.dueDate)}</span>
                        {isPastDue && <span className="text-[10px] font-bold text-red-400 ml-1">(期限切れ)</span>}
                      </div>
                    </div>

                    <p className="text-xs text-gray-300 mt-2.5 leading-relaxed bg-[#1d1d1d] p-3 rounded-lg">
                      {asg.description}
                    </p>

                    {/* 教員が設定した配布資料（PDFやWord）のダウンロードカード */}
                    {asg.attachmentName && asg.attachmentUrl && (
                      <div className="mt-3">
                        <FileAttachment name={asg.attachmentName} url={asg.attachmentUrl} />
                      </div>
                    )}

                    {/* 生徒視点：提出 & 取り下げ & 採点確認 */}
                    {userRole === 'student' && (
                      <div className="mt-4 pt-4 border-t border-[#333]">
                        {isSubmitted ? (
                          <div className="bg-emerald-950/30 border border-emerald-500/40 p-3.5 rounded-lg flex flex-col gap-2 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                                <span className="text-xs font-semibold text-emerald-300">
                                  提出済み（受付日時: {mySubmission.submittedAt}）
                                </span>
                              </div>

                              {!isPastDue ? (
                                <button
                                  onClick={() => handleCancelSubmission(asg.id, asg.dueDate, mySubmission.content, mySubmission.files)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-300 hover:text-white bg-[#2b2b2b] hover:bg-[#383838] active:scale-95 border border-gray-600 rounded-md transition-all"
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

                            {mySubmission.content && (
                              <p className="text-xs text-gray-300 bg-[#191919] p-2.5 rounded-md border border-[#2e2e2e] leading-relaxed whitespace-pre-wrap">
                                {mySubmission.content}
                              </p>
                            )}
                            {mySubmission.files && mySubmission.files.length > 0 && (
                              <div>
                                {mySubmission.files.map((f) => (
                                  <FileAttachment key={f.id} name={f.name} url={f.url} />
                                ))}
                              </div>
                            )}

                            {/* 教員からの評価・採点がある場合 */}
                            {(mySubmission.score || mySubmission.feedback) && (
                              <div className="mt-2 p-2.5 bg-[#202020] border border-amber-500/40 rounded-md text-xs animate-fade-in">
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
                              <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
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
                                  className="w-full bg-[#1b1b1b] border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-gray-300 bg-[#2b2b2b] hover:bg-[#383838] border border-gray-600 rounded-md cursor-pointer transition-all">
                                    <Paperclip size={12} />
                                    ファイルを添付
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => {
                                        const picked = Array.from(e.target.files || []);
                                        if (picked.length > 0) {
                                          setSubmissionFiles((prev) => ({
                                            ...prev,
                                            [asg.id]: [...(prev[asg.id] || []), ...picked]
                                          }));
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  {(submissionKept[asg.id] || []).map((f) => (
                                    <span key={f.id} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-300 bg-[#222] border border-gray-700 rounded-md">
                                      <FileText size={11} />
                                      {f.name}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSubmissionKept((prev) => ({
                                            ...prev,
                                            [asg.id]: (prev[asg.id] || []).filter((x) => x.id !== f.id)
                                          }))
                                        }
                                        className="text-gray-500 hover:text-red-400"
                                      >
                                        <X size={11} />
                                      </button>
                                    </span>
                                  ))}
                                  {(submissionFiles[asg.id] || []).map((f, i) => (
                                    <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-200 bg-indigo-950/40 border border-indigo-500/30 rounded-md">
                                      <FileText size={11} />
                                      {f.name}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSubmissionFiles((prev) => ({
                                            ...prev,
                                            [asg.id]: (prev[asg.id] || []).filter((_, idx) => idx !== i)
                                          }))
                                        }
                                        className="text-gray-400 hover:text-red-400"
                                      >
                                        <X size={11} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleSubmitAssignment(asg.id, asg.dueDate)}
                                    disabled={submittingId === asg.id}
                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all shadow"
                                  >
                                    {submittingId === asg.id ? '送信中...' : '課題を提出する'}
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
                                <div key={idx} className="p-3 bg-[#1e1e1e] rounded-lg text-xs border border-[#333] space-y-2 hover:border-gray-600 transition-colors">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="font-semibold text-white">{sub.studentName}</span>
                                      <span className="text-[10px] text-gray-500 ml-2">{sub.submittedAt}</span>
                                      {sub.content && (
                                        <p className="text-gray-300 mt-1 bg-[#161616] p-2 rounded whitespace-pre-wrap">{sub.content}</p>
                                      )}
                                      {sub.files && sub.files.length > 0 && (
                                        <div className="mt-1">
                                          {sub.files.map((f) => (
                                            <FileAttachment key={f.id} name={f.name} url={f.url} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                      提出済
                                    </span>
                                  </div>

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
                                      className="w-24 bg-[#141414] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
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
                                      className="flex-1 bg-[#141414] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                                    />
                                    <button
                                      onClick={() => handleGradeSubmission(asg.id, sub.studentName)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-[11px] rounded-md transition-all flex items-center gap-1 shadow"
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
          <div className="flex-1 p-8 overflow-y-auto space-y-6 animate-fade-in">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-amber-400" />
                クラスルーム総合管理設定
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                チームの名称変更、チャンネルの作成・削除、全課題の一括管理を行います。
              </p>
            </div>

            <div className="p-5 bg-[#252526] border border-[#383838] rounded-xl shadow-md">
              <h3 className="text-sm font-semibold text-white mb-3">チームの基本情報</h3>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  className="flex-1 max-w-md bg-[#1b1b1b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  onClick={handleSaveTeamName}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-medium rounded-lg transition-all shadow"
                >
                  名称を更新
                </button>
              </div>
            </div>

            <div className="p-5 bg-[#252526] border border-[#383838] rounded-xl shadow-md">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">チャンネル一覧の管理</h3>
                <button
                  onClick={() => setShowAddChannelModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs rounded-lg transition-all flex items-center gap-1 shadow"
                >
                  <Plus size={14} />
                  新規チャンネル追加
                </button>
              </div>

              <div className="space-y-2">
                {channels.map((chan) => (
                  <div key={chan.id} className="p-3 bg-[#1e1e1e] rounded-lg flex items-center justify-between border border-[#333] hover:border-gray-600 transition-colors">
                    <div>
                      <span className="font-semibold text-xs text-white">#{chan.name}</span>
                      <p className="text-[11px] text-gray-400">{chan.description}</p>
                    </div>
                    {channels.length > 1 && (
                      <button
                        onClick={() => handleDeleteChannel(chan.id, chan.name)}
                        className="text-gray-400 hover:text-red-400 p-1.5 rounded transition-colors"
                        title="チャンネルを削除"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-[#252526] border border-[#383838] rounded-xl shadow-md">
              <h3 className="text-sm font-semibold text-white mb-3">全課題の集計サマリー</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-[#1e1e1e] rounded-lg border border-[#333] transition-all hover:border-gray-600 hover:-translate-y-0.5">
                  <p className="text-[11px] text-gray-400">公開中課題数</p>
                  <p className="text-xl font-bold text-white mt-1">{assignments.length}</p>
                </div>
                <div className="p-4 bg-[#1e1e1e] rounded-lg border border-[#333] transition-all hover:border-gray-600 hover:-translate-y-0.5">
                  <p className="text-[11px] text-gray-400">総提出件数</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    {assignments.reduce((acc, cur) => acc + cur.submissions.length, 0)}
                  </p>
                </div>
                <div className="p-4 bg-[#1e1e1e] rounded-lg border border-[#333] transition-all hover:border-gray-600 hover:-translate-y-0.5">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-[#242427] border border-[#3f3f46] rounded-xl p-6 shadow-2xl transition-all duration-200 transform scale-100">
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
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">説明（任意）</label>
                <input
                  type="text"
                  placeholder="チャンネルの目的を入力"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="w-full bg-[#18181b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddChannelModal(false)}
                  className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg font-medium transition-all shadow"
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
