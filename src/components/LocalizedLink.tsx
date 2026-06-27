import { Link, type LinkProps, type To } from 'react-router-dom';
import { useLocalizedPath } from '../hooks/useLocalizedNavigate';

export function LocalizedLink({ to, ...rest }: LinkProps) {
  const pathname = typeof to === 'string' ? to : (to.pathname ?? '/');
  const localized = useLocalizedPath(pathname);
  if (typeof to === 'string') {
    return <Link to={localized} {...rest} />;
  }
  const target: To = { pathname: localized };
  if (to.search !== undefined) target.search = to.search;
  if (to.hash !== undefined) target.hash = to.hash;
  return <Link to={target} {...rest} />;
}
