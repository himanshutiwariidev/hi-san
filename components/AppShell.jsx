"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AppContext } from "@/components/AppContext";
import { TextButton } from "@/components/ui/buttons";
import { apiClient, errorMessage } from "@/lib/api";
import { readSelectedBusinessId, saveSelectedBusinessId } from "@/lib/session";

export default function AppShell({ children }) {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [businesses, setBusinesses] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [error, setError] = useState(null);

  const reloadBusinesses = useCallback(async () => {
    const list = await apiClient.listBusinesses();
    setBusinesses(list);
    setBusinessId((current) => {
      const preferred = current ?? readSelectedBusinessId();
      return list.some((b) => b.id === preferred) ? preferred : (list[0]?.id ?? null);
    });
    return list;
  }, []);

  useEffect(() => {
    Promise.all([apiClient.me(), reloadBusinesses()])
      .then(([user]) => setMe(user))
      .catch((err) => setError(errorMessage(err)));
  }, [reloadBusinesses]);

  if (error) return <div className="grid min-h-screen place-items-center text-danger">{error}</div>;
  if (!me || !businesses) return <div className="grid min-h-screen place-items-center text-muted">Loading dashboard...</div>;

  function changeBusiness(id) {
    setBusinessId(id);
    saveSelectedBusinessId(id);
  }

  async function signOut() {
    await apiClient.logout().catch(() => {});
    router.push("/login");
  }

  const business = businesses.find((b) => b.id === businessId) ?? null;

  return (
    <AppContext.Provider value={{ me, setMe, business, businesses, reloadBusinesses }}>
      <div className="grid min-h-screen grid-cols-[260px_1fr] max-[760px]:grid-cols-1">
        <Suspense>
          <Sidebar isAdmin={me.role !== "member"} />
        </Suspense>
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-3.5 max-[760px]:flex-col max-[760px]:items-stretch">
            <label className="flex items-center gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
              <span className="text-[13px] text-muted">Business</span>
              <select
                value={businessId ?? ""}
                onChange={(event) => changeBusiness(event.target.value)}
                disabled={!businesses.length}
                className="min-w-[220px] rounded-[10px] border border-border bg-surface px-2.5 py-2"
              >
                {businesses.length === 0 ? <option value="">No businesses</option> : null}
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-muted">{me.display_name}</span>
              <TextButton type="button" onClick={signOut}>
                Sign out
              </TextButton>
            </div>
          </header>
          <main className="grid gap-[22px] p-7 max-[760px]:p-4 [&>*]:min-w-0">
            {business ? (
              children
            ) : (
              <div className="rounded-lg border border-border bg-surface p-7 text-muted">
                You don&apos;t have access to any business yet. Ask your account owner to give you access.
              </div>
            )}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
