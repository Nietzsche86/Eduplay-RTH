import { useEffect, useState } from 'react';
import { ShieldAlert, Smartphone } from 'lucide-react';
import { StudentPage } from './pages/StudentPage';
import { HostPage } from './pages/HostPage';
import { SchoolLogo } from './components/SchoolLogo';
import { isClientLikelyLocalHost } from './utils/accessControl';

type RouteMode = 'student' | 'host';

function getRouteFromPath(pathname: string): RouteMode {
  return pathname.startsWith('/host') ? 'host' : 'student';
}

export default function App() {
  const [route, setRoute] = useState<RouteMode>(() => getRouteFromPath(window.location.pathname));
  const [canAccessHost, setCanAccessHost] = useState<boolean>(() => isClientLikelyLocalHost());

  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    fetch('/api/server-info')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.canAccessHost === 'boolean') {
          setCanAccessHost(data.canAccessHost);
        }
      })
      .catch(() => {
        setCanAccessHost(isClientLikelyLocalHost());
      });
  }, []);

  const navigate = (path: '/' | '/host') => {
    if (path === '/host' && !canAccessHost) return;
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(getRouteFromPath(path));
  };

  if (route === 'host') {
    if (!canAccessHost) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F4F8F6] bg-emerald-subtle-grid p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-900/15 bg-white shadow-lg">
            <div className="bg-emerald-royal p-6 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/95 p-1.5 shadow-sm">
                <SchoolLogo className="h-full w-full" />
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-amber-300/40 bg-black/25 px-3 py-1 text-xs font-bold text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                <span>Akses Terbatas Laptop Guru</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-black">
                Mode Guru Hanya di Localhost
              </h1>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm leading-relaxed text-slate-600">
                Halaman Dashboard Guru hanya dapat dibuka langsung dari laptop server guru melalui{' '}
                <strong className="font-mono-num text-emerald-900">http://localhost:3000/host</strong>
                , bukan dari HP siswa di jaringan Wi-Fi.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-tactile mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-900 bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-emerald-700"
              >
                <Smartphone className="h-4 w-4 text-amber-300" />
                <span>Kembali ke Halaman Siswa</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <HostPage onGoStudent={() => navigate('/')} />;
  }

  return <StudentPage canAccessHost={canAccessHost} onGoHost={() => navigate('/host')} />;
}
