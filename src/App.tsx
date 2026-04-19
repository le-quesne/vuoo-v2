import { AuthProvider } from '@/application/contexts/AuthContext';
import { AppRouter } from '@/application/navigation';

// TODO(fase-8b): migrar AuthContext a Zustand (application/store/useSessionStore.ts).
// La lógica actual maneja onAuthStateChange, carga de memberships con setTimeout(0)
// por el bug de auth-lock (auth-js #762) y persistencia de currentOrg en localStorage.
// Requiere refactor cuidadoso y PR aparte para no regresionar el flujo de login.

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
