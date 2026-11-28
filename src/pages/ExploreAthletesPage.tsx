import "./ExploreReview.css";
import "./ExploreAthletesPage.css";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import CoachSignInButton from "./coach/CoachSignInButton";
import { Button, Card, Input, Text } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import { USER_SEARCH_MAX_LENGTH } from "../services/userSearch";
import { AthleteSearchResults } from "../features/people/AthleteSearchResults";
import { useFriendRequestActions } from "../features/people/useFriendRequestActions";

/** 탐색 > 사람 (E5): 이메일·닉네임·친구 코드로 사용자를 찾는다. 검색어 없이 목록을 조회하지 않는다. */
export default function ExploreAthletesPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation("friends");
  const { t: commonT } = useTranslation("common");
  const actions = useFriendRequestActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = (searchParams.get("q") ?? "").trim().slice(0, USER_SEARCH_MAX_LENGTH);
  const [draft, setDraft] = useState(urlQuery);
  const [searchKey, setSearchKey] = useState(0);
  const signedIn = !!user && !user.isAnonymous;

  // URL(?q=)이 검색의 정본 — 새로고침·뒤로 가기에서도 같은 결과를 다시 그린다.
  useEffect(() => { setDraft(urlQuery); }, [urlQuery]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = draft.trim();
    if (!query) return;
    if (query === urlQuery) { setSearchKey(key => key + 1); return; }
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("q", query);
      return next;
    });
  };

  const heading = <Text data-testid="E5-0" as="h1" variant="pageTitle" className="explore-page-title">{commonT("nav.people")}</Text>;
  if (authLoading) return <div className="explore-challenges-surface space-y-4">{heading}</div>;
  if (!signedIn) {
    return <div className="explore-challenges-surface space-y-4">
      {heading}
      <div data-testid="E5.guest" className="explore-people-guest">
        <Card className="space-y-1">
          <Text as="h2" variant="title">{t("search.previewTitle")}</Text>
          <Text as="p" tone="secondary">{t("search.previewDescription")}</Text>
        </Card>
        <CoachSignInButton primary label={t("search.loginAction")} />
      </div>
    </div>;
  }

  return <div className="explore-challenges-surface space-y-4">
    {heading}
    <div className="explore-people-search">
    <form data-testid="E5-1" role="search" aria-label={t("search.label")} className="explore-people-form" onSubmit={onSubmit}>
      <Input data-testid="E5-1-1" type="search" value={draft} maxLength={USER_SEARCH_MAX_LENGTH}
        aria-label={t("search.label")} aria-describedby="explore-people-hint" placeholder={t("search.placeholder")}
        onChange={event => setDraft(event.target.value)} className="explore-people-input" />
      <Button data-testid="E5-1-2" type="submit" disabled={!draft.trim()}>
        <Search size={ICON_SIZE.sm} aria-hidden="true" />{t("search.submit")}
      </Button>
    </form>
    <Text data-testid="E5-1-3" id="explore-people-hint" as="p" variant="caption" tone="secondary">{t("search.hint")}</Text>
    </div>

    <AthleteSearchResults query={urlQuery} searchKey={searchKey} actions={actions} via="explore_search" />
  </div>;
}
