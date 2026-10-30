import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import ActivityPage from "./ActivityPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { setDocData, setCollectionDocs, simulateLogin, mockUpdateDoc } from "../__tests__/mocks/firebase";
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: async () => true, alert: vi.fn() }) }));
const photo = vi.hoisted(() => ({ upload: vi.fn(), load: vi.fn() }));
vi.mock("../services/nativeActivityPhoto", async importOriginal => ({ ...await importOriginal<typeof import("../services/nativeActivityPhoto")>(), uploadNativeActivityPhoto: photo.upload, loadNativeActivityPhoto: photo.load }));
vi.mock("../features/activity/detail/photoGps", () => ({ extractGpsFromFile: vi.fn().mockResolvedValue([37,127]) }));
vi.mock("../features/activity/detail/imageResize", () => ({ resizeImageToWebp: vi.fn().mockResolvedValue(new Blob(["webp"], {type:"image/webp"})) }));
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({activityId:"photo-ride"}) }));
vi.mock("../components/RouteMap", () => ({ default: () => <div>Map</div> }));
vi.mock("chart.js", () => ({ Chart:{register:vi.fn()}, CategoryScale:class{},LinearScale:class{},LogarithmicScale:class{},BarElement:class{},LineElement:class{},PointElement:class{},ArcElement:class{},Title:class{},Tooltip:class{},Legend:class{},Filler:class{} }));
beforeEach(() => {
 photo.upload.mockReset().mockResolvedValue({}); photo.load.mockReset().mockResolvedValue(new Blob(["webp"],{type:"image/webp"}));
 setDocData("activities/photo-ride", createMockActivity({id:"photo-ride",userId:"test-uid",source:"orider"}) as unknown as Record<string,unknown>);
 setCollectionDocs("activity_photos/photo-ride/photos", []);
});
async function choosePhoto() {
 renderWithProviders(<ActivityPage />, {authenticated:true});
 await screen.findByRole("tab",{name:"개요"});
 const input = document.querySelector('input[type="file"]')!;
 expect(input).not.toBeNull(); fireEvent.change(input,{target:{files:[new File(["jpg"],"ride.jpg",{type:"image/jpeg"})]}});
 await waitFor(() => expect(photo.upload).toHaveBeenCalledTimes(1)); return input as HTMLInputElement;
}
it("sends resized bytes and EXIF location to server upload without issuing a download URL", async () => {
 const input = await choosePhoto();
 expect(photo.upload).toHaveBeenCalledWith(expect.anything(),{activityId:"photo-ride",photoId:expect.any(String)},expect.any(Blob),[37,127]);
 expect(photo.upload.mock.calls[0]![2]).toMatchObject({type:"image/webp"});
 await waitFor(() => expect(input.value).toBe(""));
});
it.each(["permission-denied","account_changed"])("keeps a failed %s upload out of current activity photos", async failure => {
 let reject!: (error: Error) => void; photo.upload.mockReturnValue(new Promise((_resolve,r) => {reject=r;}));
 const input = await choosePhoto();
 if(failure === "account_changed") act(() => simulateLogin({uid:"another-user",displayName:"Other",email:"other@example.test",photoURL:null}));
 await act(async () => reject(new Error(failure)));
 await waitFor(() => expect(input.value).toBe(""));
 expect(screen.queryByRole("button",{name:/사진 1 \/ 1 보기/})).toBeNull();
 expect(photo.load).not.toHaveBeenCalled();
});

it("deduplicates published and owner-native photos while retaining owner delete controls", async () => {
 const { activityFeedSourceRevision } = await import("../services/activityFeedContent");
 const activity=createMockActivity({id:"photo-ride",userId:"test-uid",source:"orider",photoCount:1});
 const reference={activityId:"photo-ride",photoId:"one"};
 setDocData("activities/photo-ride",{...activity,feedContentV1:{version:1,revision:"ready",sourceRevision:activityFeedSourceRevision(activity),memo:null,totalPhotoCount:1,comments:[],photos:[{id:"one",url:"",nativePhoto:reference,caption:null}]}});
 setCollectionDocs("activity_photos/photo-ride/photos",[{id:"one",userId:"test-uid",deletedAt:null,createdAt:1,location:[37,127]}]);
 renderWithProviders(<ActivityPage />, {authenticated:true});
 const open=await screen.findByRole("button",{name:"사진 1 / 1 보기"});
 expect(screen.queryByRole("button",{name:/사진 2 \/ 2 보기/})).toBeNull();
 fireEvent.click(open);
 const remove=await screen.findByRole("button",{name:"삭제"}); fireEvent.click(remove);
 await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(expect.objectContaining({path:"activity_photos/photo-ride/photos/one"}),expect.objectContaining({deletedAt:expect.any(Number)})));
});
