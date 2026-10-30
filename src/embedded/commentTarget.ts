/** URLSearchParams already decodes once; reject duplicate, encoded traversal and oversized IDs. */
export function embeddedCommentId(params: URLSearchParams): string | null {
  const values = params.getAll("commentId");
  if (!values.length) return null;
  return values.length === 1 && /^[A-Za-z0-9_-]{1,200}$/.test(values[0] ?? "") ? values[0]! : "";
}
