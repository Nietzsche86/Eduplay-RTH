import { useEffect, useState } from 'react';
import { StudentPage } from './pages/StudentPage';
import { HostPage } from './pages/HostPage';

type RouteMode = 'student' | 'host';

function getRouteFromPath(pathname: string): RouteMode {
  return pathname.startsWith('/host') ? 'host' : 'student';
}

export default function App() {
  const [route, setRoute] = useState<RouteMode>(() => getRouteFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path: '/' | '/host') => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(getRouteFromPath(path));
  };

  if (route === 'host') {
    return <HostPage onGoStudent={() => navigate('/')} />;
  }

  return <StudentPage onGoHost={() => navigate('/host')} />;
}
