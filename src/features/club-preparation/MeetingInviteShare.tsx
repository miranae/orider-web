import { useTranslation } from "react-i18next";
import InfoTip from "../../components/InfoTip";
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
  const { t: clubText } = useTranslation("clubMeeting");
  const url = meetingInviteUrl(window.location.origin, groupId, eventId, en);
  const recordFailure = (action: string, error: unknown) => {
    logClientError("MeetingInviteShare", error, { action, groupId, eventId }, services);
  };
  const copy = async (value: string, invitation = false) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(invitation
        ? clubText("meetingInviteShareCopy.invitation_copied_paste_it_into_kakaotalk")
        : clubText("meetingInviteShareCopy.invitation_link_copied"));
    } catch (error) {
      recordFailure("copy", error);
      setStatus(clubText("meetingInviteShareCopy.select_or_press_and_hold_the"));
    }
  };
  const share = async () => {
    const payload = {
      title,
      text: `${clubText("meetingInviteShareCopy.join_our_ride")}\n${title}\n${date} ${time} · ${place}\n${clubText("meetingInviteShareCopy.sign_in_join_the_club_and")}`,
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
      setStatus(clubText("meetingInviteShareCopy.could_not_share_use_copy_invite"));
    }
  };
  return (
    <section className="cp-meeting-invite" aria-label={clubText("meetingInviteShareCopy.invite_to_meeting")}>
      <div className="cp-actions">
        <Button size="sm" variant="outline" leadingIcon={<Copy size={ICON_SIZE.sm} />}
          onClick={() => void copy(url)}>
          {clubText("meetingInviteShareCopy.copy_invite_link")}
        </Button>
        <Button size="sm" variant="outline" leadingIcon={<Share2 size={ICON_SIZE.sm} />}
          onClick={() => void share()}>
          {clubText("meetingInviteShareCopy.share")}
        </Button>
        <InfoTip label={clubText("meetingInviteShareCopy.invitation_help")} title={clubText("meetingInviteShareCopy.invite_to_meeting")} content={clubText("meetingInviteShareCopy.share_via_kakaotalk_or_messages_sign")}>{clubText("meetingInviteShareCopy.invitation_help")}</InfoTip>
      </div>
      <details>
        <summary>{clubText("meetingInviteShareCopy.invitation_link")}</summary>
        <a href={url}>{url}</a>
      </details>
      <p role="status">{status}</p>
    </section>
  );
}
