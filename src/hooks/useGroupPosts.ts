import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export interface GroupPost {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  kind: "announcement" | "post";
  createdAt: number;
}

export function normalizeGroupPostContent(value: string): string {
  const content = value.trim();
  if (!content) throw new Error("empty-content");
  if (content.length > 1_000) throw new Error("content-too-long");
  return content;
}

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

export function useGroupPosts(groupId: string | undefined) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      query(collection(firestore, "groups", groupId, "posts"), orderBy("createdAt", "desc"), limit(5)),
      (snapshot) => {
        setPosts(snapshot.docs.map((post) => {
          const data = post.data();
          return {
            id: post.id,
            authorId: typeof data.authorId === "string" ? data.authorId : "",
            authorName: typeof data.authorName === "string" ? data.authorName : "",
            content: typeof data.content === "string" ? data.content : "",
            kind: data.kind === "announcement" ? "announcement" : "post",
            createdAt: toMillis(data.createdAt),
          };
        }));
        setLoading(false);
      },
      (err) => {
        logClientError("useGroupPosts.snapshot", err, { groupId });
        setPosts([]);
        setLoading(false);
      },
    );
  }, [groupId]);

  return { posts, loading };
}

export async function createGroupPost(input: {
  groupId: string;
  content: string;
  kind: "announcement" | "post";
}): Promise<void> {
  const fn = httpsCallable<
    { groupId: string; content: string; kind: "announcement" | "post" },
    { postId: string }
  >(functions, "createGroupPost");
  await fn({ groupId: input.groupId, content: normalizeGroupPostContent(input.content), kind: input.kind });
}
