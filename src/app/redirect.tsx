import { useEffect } from 'react';
import { useRepo } from '../data/repo.ts';
import { useRouter } from './router.tsx';

/** After a slug change, an in-app visit to the old path follows the on-site redirect. */
export function useCanonicalRedirect(missing: boolean, path: string) {
  const repo = useRepo();
  const { navigate } = useRouter();
  useEffect(() => {
    if (!missing || !path) return;
    let cancel = false;
    repo.resolveRedirect(path).then((to) => {
      if (!cancel && to && to !== path) navigate(to, { replace: true });
    }).catch(() => {});
    return () => { cancel = true; };
  }, [missing, path, repo, navigate]);
}
