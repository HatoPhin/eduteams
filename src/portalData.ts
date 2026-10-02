// src/portalData.ts
// channels / assignments を Appwrite Database で永続化 + Realtime 同期するデータ層
import { useCallback, useEffect, useState } from 'react';
import { ID, Query, type Models } from 'appwrite';
import {
  databases,
  client,
  DB_ID,
  CHANNELS_COLLECTION_ID,
  ASSIGNMENTS_COLLECTION_ID,
} from './appwrite';

/* ---------- 型 ---------- */
export interface Channel {
  $id: string;
  name: string;
  order: number;
}

export interface Submission {
  studentId: string;
  studentName: string;
  text: string;
  fileIds: string[];
  submittedAt: string; // ISO
  score?: number | null;
  feedback?: string;
}

export interface Assignment {
  $id: string;
  title: string;
  description: string;
  dueDate: string; // ISO
  channelId: string;
  attachmentIds: string[];
  submissions: Submission[]; // DB上は JSON 文字列で保存
  createdBy: string;
}

/* ---------- ドキュメント <-> モデル変換 ---------- */
const toChannel = (d: Models.Document): Channel => ({
  $id: d.$id,
  name: d.name,
  order: d.order ?? 0,
});

const toAssignment = (d: Models.Document): Assignment => ({
  $id: d.$id,
  title: d.title,
  description: d.description ?? '',
  dueDate: d.dueDate,
  channelId: d.channelId ?? '',
  attachmentIds: d.attachmentIds ?? [],
  submissions: d.submissions ? JSON.parse(d.submissions) : [],
  createdBy: d.createdBy ?? '',
});

const fromAssignment = (a: Partial<Assignment>) => {
  const { $id, submissions, ...rest } = a;
  return {
    ...rest,
    ...(submissions !== undefined && { submissions: JSON.stringify(submissions) }),
  };
};

/* ---------- 汎用: 取得 + Realtime 購読フック ---------- */
function useRealtimeCollection<T extends { $id: string }>(
  collectionId: string,
  convert: (d: Models.Document) => T,
  queries: string[] = []
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    databases
      .listDocuments(DB_ID, collectionId, [...queries, Query.limit(100)])
      .then((res) => active && setItems(res.documents.map(convert)))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));

    const channel = `databases.${DB_ID}.collections.${collectionId}.documents`;
    const unsubscribe = client.subscribe(channel, (ev) => {
      const doc = ev.payload as Models.Document;
      const type = ev.events[0] ?? '';
      setItems((prev) => {
        if (type.endsWith('.create')) {
          return prev.some((i) => i.$id === doc.$id) ? prev : [...prev, convert(doc)];
        }
        if (type.endsWith('.update')) {
          return prev.map((i) => (i.$id === doc.$id ? convert(doc) : i));
        }
        if (type.endsWith('.delete')) {
          return prev.filter((i) => i.$id !== doc.$id);
        }
        return prev;
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  return { items, setItems, loading, error };
}

/* ---------- Channels ---------- */
export function useChannels() {
  const { items, loading, error } = useRealtimeCollection<Channel>(
    CHANNELS_COLLECTION_ID,
    toChannel,
    [Query.orderAsc('order')]
  );

  const addChannel = useCallback(async (name: string, order: number) => {
    await databases.createDocument(DB_ID, CHANNELS_COLLECTION_ID, ID.unique(), { name, order });
  }, []);

  const renameChannel = useCallback(async (id: string, name: string) => {
    await databases.updateDocument(DB_ID, CHANNELS_COLLECTION_ID, id, { name });
  }, []);

  const removeChannel = useCallback(async (id: string) => {
    await databases.deleteDocument(DB_ID, CHANNELS_COLLECTION_ID, id);
  }, []);

  return { channels: items, loading, error, addChannel, renameChannel, removeChannel };
}

/* ---------- Assignments ---------- */
export function useAssignments() {
  const { items, loading, error } = useRealtimeCollection<Assignment>(
    ASSIGNMENTS_COLLECTION_ID,
    toAssignment,
    [Query.orderAsc('dueDate')]
  );

  const addAssignment = useCallback(async (a: Omit<Assignment, '$id' | 'submissions'>) => {
    await databases.createDocument(
      DB_ID,
      ASSIGNMENTS_COLLECTION_ID,
      ID.unique(),
      fromAssignment({ ...a, submissions: [] })
    );
  }, []);

  const updateAssignment = useCallback(async (id: string, patch: Partial<Assignment>) => {
    await databases.updateDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id, fromAssignment(patch));
  }, []);

  const removeAssignment = useCallback(async (id: string) => {
    await databases.deleteDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id);
  }, []);

  /** 提出・再提出・取り下げ・採点はすべて submissions 配列の更新として扱う。
   *  直前に最新を取り直してから書き込み、同時更新の取りこぼしを減らす。 */
  const mutateSubmissions = useCallback(
    async (id: string, fn: (subs: Submission[]) => Submission[]) => {
      const fresh = await databases.getDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id);
      const subs: Submission[] = fresh.submissions ? JSON.parse(fresh.submissions) : [];
      await databases.updateDocument(DB_ID, ASSIGNMENTS_COLLECTION_ID, id, {
        submissions: JSON.stringify(fn(subs)),
      });
    },
    []
  );

  const submit = useCallback(
    (id: string, sub: Submission) =>
      mutateSubmissions(id, (s) => [...s.filter((x) => x.studentId !== sub.studentId), sub]),
    [mutateSubmissions]
  );

  const withdraw = useCallback(
    (id: string, studentId: string) =>
      mutateSubmissions(id, (s) => s.filter((x) => x.studentId !== studentId)),
    [mutateSubmissions]
  );

  const grade = useCallback(
    (id: string, studentId: string, score: number | null, feedback: string) =>
      mutateSubmissions(id, (s) =>
        s.map((x) => (x.studentId === studentId ? { ...x, score, feedback } : x))
      ),
    [mutateSubmissions]
  );

  return {
    assignments: items,
    loading,
    error,
    addAssignment,
    updateAssignment,
    removeAssignment,
    submit,
    withdraw,
    grade,
  };
}
