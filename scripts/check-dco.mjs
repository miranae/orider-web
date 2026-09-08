import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Individual remediation only: https://github.com/dcoapp/app#individual-remediation-commit-support */
export function checkDco(base, head, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trimEnd();
  const resolve = (ref) => git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
  const range = `${resolve(base)}..${resolve(head)}`;
  const fields = git('log', '--no-merges', '--format=%H%x00%an <%ae>%x00%B%x00', range).split('\0');
  const commits = [];
  for (let i = 0; i + 2 < fields.length; i += 3) {
    commits.push({ sha: fields[i].trim(), author: fields[i + 1], message: fields[i + 2] });
  }
  const signed = message => /^Signed-off-by: .+ <.+@.+>$/im.test(message);
  const missing = commits.filter(commit => !signed(commit.message));
  const remediated = [];
  for (const target of missing) {
    for (const attestation of commits) {
      if (attestation.author !== target.author) continue;
      const lines = attestation.message.split('\n');
      if (!lines.includes(`Signed-off-by: ${target.author}`)
        || !lines.includes(`I, ${target.author}, hereby add my Signed-off-by to this commit: ${target.sha}`)) continue;
      // 동일 작성자와 전체 SHA만으로는 부족하다. 해당 과거 커밋 뒤의 도달 가능한 증빙이어야 한다.
      try { git('merge-base', '--is-ancestor', target.sha, attestation.sha); }
      catch { continue; }
      remediated.push({ sha: target.sha, attestation: attestation.sha });
      break;
    }
  }
  return { checked: commits.length, remediated, missing: missing.filter(commit => !remediated.some(item => item.sha === commit.sha)).map(commit => commit.sha) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) throw new Error('Usage: node scripts/check-dco.mjs <base> <head>');
  const result = checkDco(base, head);
  for (const item of result.remediated) console.log(`DCO individual remediation: ${item.sha} via ${item.attestation}`);
  for (const sha of result.missing) console.error(`::error::Commit ${sha} is missing a DCO Signed-off-by line or valid individual remediation.`);
  console.log(`DCO checked=${result.checked} remediated=${result.remediated.length} missing=${result.missing.length}`);
  process.exitCode = result.missing.length ? 1 : 0;
}
