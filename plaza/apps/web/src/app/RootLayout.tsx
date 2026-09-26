import { Outlet } from 'react-router';

/** Shell shared by every page. */
export function RootLayout() {
  return (
    <div className="min-h-full">
      <Outlet />
    </div>
  );
}
