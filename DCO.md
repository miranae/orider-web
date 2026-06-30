# Developer Certificate of Origin 안내

이 프로젝트는 기여자에게 DCO sign-off를 요구합니다. 영문 원문은 [DCO-en.md](DCO-en.md)를 참고하세요.

## 의미

커밋에 `Signed-off-by`를 추가하면 다음을 확인하는 것입니다.

- 직접 작성했거나, 제출할 권리가 있는 작업입니다.
- 프로젝트 라이선스에 따라 배포될 수 있음을 이해합니다.
- 다른 사람의 저작물, 비공개 코드, 운영 데이터, secret을 무단으로 포함하지 않았습니다.

## 사용 방법

커밋할 때 `-s`를 붙입니다.

```bash
git commit -s -m "fix: handle mobile tab overflow"
```

이미 만든 마지막 커밋에 sign-off를 추가하려면:

```bash
git commit --amend -s --no-edit
```

여러 커밋에 빠졌다면 interactive rebase나 새 커밋으로 정리한 뒤 push하세요.

## PR 체크

`DCO` GitHub Action이 모든 커밋에 sign-off가 있는지 확인합니다. 실패하면 누락된 커밋을 수정하고 다시 push하면 됩니다.
