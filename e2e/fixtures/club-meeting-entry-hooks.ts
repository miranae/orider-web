// Synthetic data for the production club entry/list/form. No production reads or writes.
const params = new URLSearchParams(location.search);
export const english = params.get("lang") === "en";
export const role = params.get("role") === "leader" ? "leader" : "member";
export const group = {
  id: "fixture", creatorId: "fixture-host", memberCount: 5, sports: ["bike"],
  name: params.has("long") ? (english ? "Weekend Riverside Riders and Friends Cycling Club" : "주말마다 한강을 함께 달리는 라이더와 친구들의 클럽") : (english ? "Weekend riders" : "주말 라이더스"),
  description: (english ? "A welcoming club for riding together. " : "함께 모여 즐겁게 달리는 클럽입니다. ").repeat(20),
};
export const user = { uid: role === "leader" ? "fixture-host" : "fixture-member", isAnonymous: false, displayName: "Fixture rider" };
export const services = { auth: { currentUser: user }, firestore: {}, functions: {}, scope: "web", ensureAppCheckReady: async () => {} };
export const useAuth = () => ({ user, loading: false, signIn: async () => {} });
export const useGroup = () => ({ group, loading: false, error: null, retry: () => {} });
export const useGroupMemberRole = () => ({ role, loading: false, error: null, retry: () => {} });
export const useGroupMembers = () => ({ members: [], loading: false, error: null, retry: () => {} });
const api = { listClubMeetings: async () => ({ meetings: [], nextCursor: null }), createClubMeeting: async () => ({ eventId: "created" }) };
export const useClubMeetingsApi = () => api;
export const getVisibleEventPage = async () => ({ docs: [], nextCursor: null });
export const useClubMeeting = () => ({ data: null, loading: false, error: null, reload: async () => {}, loadOlderNotices: async () => {} });
