import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { isShareCancellation, sharePayloadForClipboard } from "../share/oriderShareText";

export function meetingInviteUrl(
  origin: string, groupId: string, eventId: string, en: boolean,
): string {
  return `${origin.replace(/\/$/, "")}/${en ? "en" : "ko"}/m/${encodeURIComponent(groupId)}/${encodeURIComponent(eventId)}`;
}

type Props = {
  groupId: string;
  eventId: string;
  title: string;
  date: string;
  time: string;
  place: string;
  en: boolean;
};

export default function MeetingInviteShare({ groupId, eventId, title, date, time, place, en }: Props) {
  const services = useFirebaseServices();
  const [status, setStatus] = useState("");
  const text = (ko: string, english: string) => en ? english : ko;
  const url = meetingInviteUrl(window.location.origin, groupId, eventId, en);
  const recordFailure = (action: string, error: unknown) => {
    logClientError("MeetingInviteShare", error, { action, groupId, eventId }, services);
  };
  const copy = async (value: string, invitation = false) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(invitation
        ? text("초대 문구와 링크를 복사했어요. 카카오톡이나 메시지에 붙여넣으세요.", "Invitation copied. Paste it into KakaoTalk or Messages.")
        : text("초대 링크를 복사했어요.", "Invitation link copied."));
    } catch (error) {
      recordFailure("copy", error);
      setStatus(text("아래 링크를 길게 누르거나 선택해 복사해주세요.", "Select or press and hold the link below to copy."));
    }
  };
  const share = async () => {
    const payload = {
      title,
      text: `${text("함께 라이딩해요!", "Join our ride!")}\n${title}\n${date} ${time} · ${place}\n${text("로그인 후 클럽 가입 및 참가 신청이 필요합니다.", "Sign in, join the club and register to attend.")}`,
      url,
    };
    setStatus("");
    if (typeof navigator.share !== "function") {
      await copy(sharePayloadForClipboard(payload), true);
      return;
    }
    try {
      await navigator.share(payload);
    } catch (error) {
      if (isShareCancellation(error)) return;
      recordFailure("share", error);
      setStatus(text("공유하지 못했어요. 초대 링크 복사를 눌러주세요.", "Could not share. Use Copy invite link."));
    }
  };
  return (
    <section className="cp-meeting-invite" aria-label={text("모임 초대", "Invite to meeting")}>
      <div className="cp-actions">
        <Button size="sm" variant="outline" leadingIcon={<Copy size={ICON_SIZE.sm} />}
          onClick={() => void copy(url)}>
          {text("초대 링크 복사", "Copy invite link")}
        </Button>
        <Button size="sm" variant="outline" leadingIcon={<Share2 size={ICON_SIZE.sm} />}
          onClick={() => void share()}>
          {text("공유", "Share")}
        </Button>
      </div>
      <details>
        <summary>{text("간편 초대 링크", "Invitation link")}</summary>
        <a href={url}>{url}</a>
      </details>
      <p>{text("카카오톡·메시지로 공유하세요. 참여하려면 로그인과 클럽 가입이 필요해요.", "Share via KakaoTalk or Messages. Sign-in and club membership are required.")}</p>
      <p role="status">{status}</p>
    </section>
  );
}
