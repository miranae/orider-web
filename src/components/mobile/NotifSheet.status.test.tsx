import { screen } from "@testing-library/react";
import type { Notification } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import NotifSheet from "./NotifSheet";
import { NotificationInboxMore, NotificationInboxStatus } from "../notifications/NotificationInboxStatus";

const item = { id: "n1", type: "friend_accept", fromUserId: "f1", fromNickname: "조용우", message: "조용우님과 친구가 되었습니다.", read: false, createdAt: Date.now() } as unknown as Notification;

function sheet(state: { items: Notification[]; loading: boolean; failed?: boolean; hasMore?: boolean }) {
  return renderWithProviders(<NotifSheet open onClose={() => undefined} onMarkAllRead={() => undefined} onNotificationClick={() => undefined}
    notifications={state.items}
    notificationStatus={<NotificationInboxStatus empty={!state.items.length} loading={state.loading} failed={state.failed ?? false} onRetry={() => undefined} />}
    notificationFooter={<NotificationInboxMore hasMore={state.hasMore ?? false} loading={state.loading} onMore={() => undefined} />} />);
}

it("목록이 있으면 갱신 중 문구·안내문 없이 목록을 보여주고, 이전 알림 더 보기는 목록 뒤에 둔다", () => {
  sheet({ items: [item], loading: true, hasMore: true });
  expect(screen.queryByText("알림을 확인하고 있어요.")).not.toBeInTheDocument();
  expect(screen.queryByText(/20개씩/)).not.toBeInTheDocument();
  const row = screen.getByText("조용우님과 친구가 되었습니다.");
  const more = screen.getByRole("button", { name: "이전 알림 더 보기" });
  expect(row.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("처음 불러오는 중에만 확인 중 문구를, 비어 있으면 알림 없음 문구를 보여준다", () => {
  const view = sheet({ items: [], loading: true });
  expect(screen.getByRole("status")).toHaveTextContent("알림을 확인하고 있어요.");
  view.unmount();
  sheet({ items: [], loading: false });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("알림이 없습니다")).toBeInTheDocument();
});
