import "./CommunityPeople.css";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import Avatar from "../../components/Avatar";
import { Button, Card, Text } from "../../theme/components";
import { friendSuggestionReason, listFriendSuggestions, type FriendSuggestion } from "../../services/friendSuggestions";
import type { FriendRequestActions } from "./useFriendRequestActions";

const SUGGESTION_LIMIT = 10;

/**
 * 커뮤니티 「친구 찾기」 추천 카드 가로 줄. 비로그인·익명·로딩 중·빈 목록·오류(콜러블 미배포 포함)면
 * 줄 전체를 그리지 않는다 — 빈 칸이나 안내 문구를 두지 않는다. 이미 친구가 된 사람은 카드에서 뺀다.
 */
export function FriendSuggestionsRow({ actions }: { actions: FriendRequestActions }) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const { t } = useTranslation("friends");
  // 받은 목록은 요청한 계정과 함께 둔다 — 계정이 바뀌면 새 응답 전까지 옛 계정 추천을 보이지 않는다.
  const [loaded, setLoaded] = useState<{ viewerId: string; items: FriendSuggestion[] } | null>(null);
  const viewerId = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    void listFriendSuggestions(services, SUGGESTION_LIMIT).then(items => { if (!cancelled) setLoaded({ viewerId, items }); });
    return () => { cancelled = true; };
  }, [viewerId, services]);

  const items = viewerId && loaded?.viewerId === viewerId ? loaded.items : [];
  const visible = items.filter(item => item.uid !== viewerId && actions.friendState(item.uid) !== "friend");
  if (visible.length === 0) return null;

  return <section data-testid="community-suggestions" aria-labelledby="community-suggestions-title" className="community-suggestions">
    <Text id="community-suggestions-title" as="h2" variant="title">{t("suggestions.title")}</Text>
    <ul className="community-suggestions-row">
      {visible.map(item => {
        const name = item.nickname || t("defaultNickname");
        const reason = friendSuggestionReason(item);
        const state = actions.friendState(item.uid);
        const pending = actions.pending.get(item.uid);
        return <li key={item.uid} data-testid="community-suggestion">
          <Card padding="compact" className="community-suggestion-card">
            <Link to={`/athlete/${item.uid}`} className="community-suggestion-profile">
              <Avatar name={name} imageUrl={item.profileImageUrl} size="lg" />
              <Text as="span" variant="bodyMedium" truncate className="community-suggestion-name">{name}</Text>
            </Link>
            <Text as="span" variant="caption" tone="secondary" className="community-suggestion-reason">
              {reason?.kind === "coRide" ? t("suggestions.coRide", { count: reason.count })
                : reason?.kind === "club" ? t("suggestions.sameClub") : " "}
            </Text>
            {state === "received"
              ? <Button size="sm" block loading={pending === "accept"} aria-label={t("acceptNamed", { name })}
                onClick={() => void actions.accept({ id: item.uid, nickname: name })}>{t("accept")}</Button>
              : state === "sent"
                ? <Button size="sm" block variant="secondary" disabled>{t("suggestions.sent")}</Button>
                : <Button size="sm" block disabled={!!pending} aria-label={t("search.action.requestNamed", { name })}
                  onClick={() => void actions.send({ id: item.uid, nickname: item.nickname }, { via: "community_suggestion" })}>{t("suggestions.request")}</Button>}
          </Card>
        </li>;
      })}
    </ul>
  </section>;
}
