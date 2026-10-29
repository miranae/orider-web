import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import { LocalizedLink } from '../../../components/LocalizedLink';
import { buttonClass } from '../../../theme';
export default function RouteInventoryReturn({ ownerUid }: { ownerUid: string }) {
 const {user}=useAuth(),{state}=useLocation(),{t}=useTranslation('activity');
 const target=state?.routeInventoryReturn;
 if(!user||user.isAnonymous||user.uid!==ownerUid||target?.uid!==user.uid||typeof target.pathname!=='string'||!/^\/(?:ko\/|en\/)?activity\/[A-Za-z0-9_-]{1,200}$/.test(target.pathname)||typeof target.search!=='string'||target.search.length>2048||typeof target.hash!=='string'||target.hash.length>256)return null;
 return <LocalizedLink className={buttonClass({variant:'ghost',size:'sm'})} to={{pathname:target.pathname,search:target.search,hash:target.hash}}>{t('routeInventory.return')}</LocalizedLink>;
}
