import "../features/people/CommunityPeople.css";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button, Input, Text } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import { USER_SEARCH_MAX_LENGTH } from "../services/userSearch";
import { AthleteSearchResults } from "../features/people/AthleteSearchResults";
import { FriendSuggestionsRow } from "../features/people/FriendSuggestionsRow";
import { useFriendRequestActions } from "../features/people/useFriendRequestActions";
import BoardPage from "./BoardPage";

/**
 * 앱 탐색 「커뮤니티」(#1929, B안): 사람·게시판 서브탭을 합친 한 화면.
 * 상단 검색창 하나(`?q=`) — 검색어가 있으면 「라이더」(사람 검색)·「글」(게시판 검색) 두 묶음,
 * 없으면 「친구 찾기」 추천 줄 + 게시판 목록. 게시판 칩·`type`/`view` 쿼리는 BoardPage 그대로다.
 */
export default function CommunityPage() {
  const { user } = useAuth();
  const { t } = useTranslation("common");
  const actions = useFriendRequestActions();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const [draft, setDraft] = useState(query);
  const [searchKey, setSearchKey] = useState(0);
  const signedIn = !!user && !user.isAnonymous;

  useEffect(() => { setDraft(query); }, [query]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = draft.trim();
    if (next && next === query) { setSearchKey(key => key + 1); return; }
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      if (next) updated.set("q", next); else updated.delete("q");
      // 게시판 페이지 번호는 검색어가 바뀌면 처음부터
      updated.delete("page");
      return updated;
    });
  };

  return <div data-testid="community-page" className="community-page">
    <form role="search" aria-label={t("community.searchPlaceholder")} className="community-search" onSubmit={onSubmit}>
      <Input data-testid="community-search-input" type="search" enterKeyHint="search" value={draft}
        aria-label={t("community.searchPlaceholder")} placeholder={t("community.searchPlaceholder")}
        onChange={event => setDraft(event.target.value)} className="community-search-input" />
      <Button type="submit" variant="ghost" iconOnly aria-label={t("community.search")}>
        <Search size={ICON_SIZE.md} aria-hidden="true" />
      </Button>
    </form>
    {query ? <>
      {signedIn && <section data-testid="community-riders" aria-labelledby="community-riders-title" className="community-group">
        <Text id="community-riders-title" as="h2" variant="title">{t("community.riders")}</Text>
        <AthleteSearchResults query={query.slice(0, USER_SEARCH_MAX_LENGTH)} searchKey={searchKey} actions={actions} via="community_search" />
      </section>}
      <section data-testid="community-posts" aria-labelledby="community-posts-title" className="community-group">
        <Text id="community-posts-title" as="h2" variant="title">{t("community.posts")}</Text>
        <BoardPage community />
      </section>
    </> : <>
      <FriendSuggestionsRow actions={actions} />
      <BoardPage community />
    </>}
  </div>;
}
