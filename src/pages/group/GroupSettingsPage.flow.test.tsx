import { auth } from "../../services/firebase";
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockUpdateDoc } from '../../__tests__/mocks/firebase';
import strings from '../../i18n/resources/ko/group.json';
import GroupSettingsPage from './GroupSettingsPage';
const state=vi.hoisted(()=>({uid:'qa-owner',role:'leader',toast:vi.fn(),group:{id:'qa-club',name:'Example Club',creatorId:'qa-owner',description:'Club description',visibility:'public',kind:'club',sports:['bike'],approval:'auto',monthlyGoalKm:0,toggles:{membersPost:true,ridePhotos:false,showInDirectory:true,notifyMembers:true,postEvents:true}}}));
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:{uid:state.uid}})}));
vi.mock('../../contexts/ToastContext',()=>({useToast:()=>({showToast:state.toast})}));
vi.mock('../../contexts/DialogContext',()=>({useDialog:()=>({confirm:vi.fn().mockResolvedValue(true),alert:vi.fn()})}));
vi.mock('../../hooks/useGroup',()=>({useGroup:()=>({group:state.group,loading:false}),useGroupMemberRole:()=>({role:state.role,loading:false})}));
vi.mock('../../components/group/GroupSubNav',()=>({default:()=> <header>Club context</header>}));
vi.mock('./GroupMembersPage',()=>({default:()=> <p>Member management controls</p>}));
vi.mock('../../components/group/GroupRequestHistory',()=>({default:()=> <p>Request history</p>}));
vi.mock('../../features/group/groupInviteAdmin',()=>({getGroupInviteCode:vi.fn().mockResolvedValue({inviteCode:'QA123456',expiresAt:Date.now()+86400000,useLimit:10,useCount:1}),regenerateGroupInviteCode:vi.fn()}));
function Page(){return <MemoryRouter initialEntries={['/ko/club/qa-club/settings']}><Routes><Route path='/:lang/club/:groupId/settings' element={<GroupSettingsPage/>}/></Routes></MemoryRouter>;}
function mount(){return render(<Page/>);}
beforeEach(()=>{Object.assign(auth,{currentUser:{uid:'qa-owner'}});state.uid='qa-owner';state.role='leader';state.toast.mockClear();mockUpdateDoc.mockReset().mockResolvedValue(undefined);});
describe('club settings editing and administration flow',()=>{
  it('labels profile fields, groups policy switches, and saves changed values through the existing contract',async()=>{
    let finish!:()=>void;mockUpdateDoc.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));mount();
    expect(screen.getByRole('textbox',{name:strings['settings.name']})).toHaveValue('Example Club');
    expect(screen.getByRole('textbox',{name:strings['settings.badge']})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:strings['settings.location']})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:strings['settings.description']})).toHaveValue('Club description');
    expect(screen.getByRole('spinbutton',{name:strings['settings.monthlyGoal.title']})).toHaveValue(0);
    expect(screen.getByText(strings['settings.noChanges'])).toBeInTheDocument();
    expect(screen.getByTestId('C7-0')).toBeDisabled();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    const membersPost=screen.getByRole('checkbox',{name:strings['settings.toggles.membersPost']});
    expect(membersPost).toBeChecked();fireEvent.click(membersPost);
    expect(screen.getByText(strings['settings.unsavedChanges'])).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('C7-0'));
    await waitFor(()=>expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('C7-0')).toBeDisabled();
    expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({name:'Example Club',monthlyGoalKm:0,toggles:{membersPost:false}});
    await act(async()=>finish());
    expect(screen.getByText(strings['settings.noChanges'])).toBeInTheDocument();
  });
  it('keeps edits made while a save is pending dirty after the submitted snapshot succeeds',async()=>{
    let finish!:()=>void;mockUpdateDoc.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));mount();
    const name=screen.getByRole('textbox',{name:strings['settings.name']});
    fireEvent.change(name,{target:{value:'Submitted name'}});fireEvent.click(screen.getByTestId('C7-0'));
    await waitFor(()=>expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    fireEvent.change(name,{target:{value:'Newer unsaved name'}});
    await act(async()=>finish());
    expect(name).toHaveValue('Newer unsaved name');
    expect(screen.getByText(strings['settings.unsavedChanges'])).toBeInTheDocument();
    expect(screen.getByTestId('C7-0')).toBeEnabled();
    expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({name:'Submitted name'});
  });
  it('does not notify or navigate the new account after an old delete finishes',async()=>{
    let finish!:()=>void;mockUpdateDoc.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));const view=mount();
    fireEvent.click(screen.getByText(strings['settings.dangerZone'],{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:strings['button.deleteGroup']}));fireEvent.click(screen.getByRole('button',{name:strings['button.confirmDelete']}));
    state.uid='qa-co';state.role='co-leader';Object.assign(auth,{currentUser:{uid:'qa-co'}});view.rerender(<Page/>);await act(async()=>finish());
    expect(state.toast).not.toHaveBeenCalled();expect(screen.getByRole('textbox',{name:strings['settings.name']})).toBeInTheDocument();
  });
  it('supports roving radio focus and keyboard changes without saving',()=>{
    mount();const group=screen.getByRole('radiogroup',{name:strings['settings.kind']});const radios=within(group).getAllByRole('radio');
    radios[0]!.focus();fireEvent.keyDown(radios[0]!,{key:'ArrowRight'});expect(radios[1]).toHaveFocus();expect(radios[1]).toHaveAttribute('aria-checked','true');expect(radios[0]).toHaveAttribute('tabindex','-1');
    expect(screen.getByText(strings['settings.unsavedChanges'])).toBeInTheDocument();expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('removes member and invite controls from settings and links directly to leadership',()=>{
    mount();
    expect(screen.queryByText('Member management controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('C7-6')).not.toBeInTheDocument();
    const danger=screen.getByText(strings['settings.dangerZone'],{selector:'summary'});
    expect(danger.closest('details')).not.toHaveAttribute('open');fireEvent.click(danger);
    expect(screen.getByRole('link',{name:strings['settings.transferLink']})).toHaveAttribute('href','/ko/club/qa-club/members?section=leadership');
    fireEvent.click(screen.getByRole('button',{name:strings['button.deleteGroup']}));
    expect(screen.getByRole('button',{name:strings['button.confirmDelete']})).toBeInTheDocument();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:strings['button.cancel']}));
    expect(screen.queryByRole('button',{name:strings['button.confirmDelete']})).not.toBeInTheDocument();
  });
  it('preserves co-leader controls without exposing owner-only policy and deletion actions',()=>{
    state.uid='qa-co';state.role='co-leader';mount();
    expect(screen.queryByTestId('C7-4-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('C7-7')).not.toBeInTheDocument();
    expect(screen.queryByText(strings['breadcrumb.memberManagement'],{selector:'summary'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.queryByTestId('C7-6-2')).not.toBeInTheDocument();
  });
});
