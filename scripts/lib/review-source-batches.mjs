// 승격 전체 리뷰의 배치 상한. 414368c4..dev 승격 리뷰가 70배치라 64 에서 96 으로 올렸다(#1836, 앞선 상향 #1814).
export const MAX_REVIEW_BATCHES = 96;

/** Keep complete dependency groups together without repeatedly copying shared sources. */
export function packReviewSourceGroups({ groups, core, cost, bytes, maxBytes }) {
  const ordered = [...new Map(groups.map(group => [
    [...group].sort().join("\0"), new Set(group),
  ])).values()].sort((a, b) => [...a].sort().join("\0").localeCompare([...b].sort().join("\0")));
  let remaining = ordered.filter(group => group.size);
  const chunks = [];
  // The estimated cost excludes the final batch header. The rendered input is
  // checked again by the caller; this reserve avoids filling to that boundary.
  const budget = maxBytes - 128;
  while (remaining.length) {
    const chunk = new Set(core);
    let chunkBytes = bytes(chunk);
    while (true) {
      remaining = remaining.filter(group => ![...group].every(file => chunk.has(file)));
      let best = null;
      for (let index = 0; index < remaining.length; index++) {
        let added = 0;
        let overlap = 0;
        for (const file of remaining[index]) {
          if (chunk.has(file)) overlap += cost(file);
          else added += cost(file);
        }
        if (chunkBytes + added > budget) continue;
        // Prefer the most shared source bytes, then fill available space.
        // Choosing only the smallest addition scatters large common callees
        // across batches and exhausts the batch limit for a bounded source set.
        if (!best || overlap > best.overlap || overlap === best.overlap && added > best.added) {
          best = { index, overlap, added };
        }
      }
      if (!best) break;
      for (const file of remaining.splice(best.index, 1)[0]) chunk.add(file);
      chunkBytes = bytes(chunk);
    }
    if (chunk.size === core.size && remaining.length) {
      throw new Error("A dependency caller/callee pair exceeds one input budget; split the PR");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) chunks.push(new Set(core));
  if (chunks.length > MAX_REVIEW_BATCHES) throw new Error(`Review requires more than ${MAX_REVIEW_BATCHES} batches; split the PR`);
  return chunks;
}
