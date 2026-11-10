import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { HOME_PATH, REGISTER_PATH, SAVED_PATH, SIGN_IN_PATH } from "./auth/guard.ts";
import { Browse } from "./screens/Browse.tsx";
import { Register } from "./screens/Register.tsx";
import { Saved } from "./screens/Saved.tsx";
import { SignIn } from "./screens/SignIn.tsx";

/**
 * Routes. The auth screens are public; everything else sits behind
 * ProtectedRoute, which sends signed-out visitors to the sign-in screen and
 * remembers where they were headed. AppShell is the layout the signed-in
 * screens render into — header, screen, bottom nav.
 */
export function App() {
  return (
    <Routes>
      <Route path={SIGN_IN_PATH} element={<SignIn />} />
      <Route path={REGISTER_PATH} element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path={HOME_PATH} element={<Browse />} />
          <Route path={SAVED_PATH} element={<Saved />} />
        </Route>
      </Route>
      {/* Unknown URLs go through the guard rather than 404-ing, so a stale
          deep link still ends at sign-in when there is no session. */}
      <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
    </Routes>
  );
}
