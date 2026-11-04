"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import PrimaryButton from "@/components/ui/PrimaryButton";
import StatusPill from "@/components/ui/StatusPill";
import { IconButton } from "@/components/ui/buttons";
import { inputClass, LabeledField } from "@/components/ui/fields";
import { Table, Th, Td } from "@/components/ui/Table";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/useResource";

const roles = [
  { value: "admin", label: "Admin", description: "All businesses, users, keywords, filters and webhooks." },
  { value: "member", label: "Member", description: "Only the businesses you give them access to." },
];

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserModal({ user, businesses, onClose, onSaved }) {
  const editing = Boolean(user);
  const [draft, setDraft] = useState({
    display_name: user?.display_name ?? "",
    email: user?.email ?? "",
    password: "",
    role: user?.role ?? "member",
    business_ids: user?.businesses ?? [],
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) await apiClient.updateUser(user.id, { role: draft.role, business_ids: draft.business_ids });
      else await apiClient.createUser(draft);
      onSaved(editing ? "User updated." : `${draft.display_name} can now log in with the password you set.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${user.display_name}` : "Add user"} description={editing ? user.email : "Share the email and password with them. They can change the password from Profile."} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        {!editing ? (
          <>
            <LabeledField label="Full name">
              <input required value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Email">
              <input required type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Temporary password (min 8 characters)">
              <input required minLength={8} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={inputClass} autoComplete="new-password" />
            </LabeledField>
          </>
        ) : null}
        <div className="grid gap-2">
          <span className="text-[13px] text-muted">Role</span>
          <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1">
            {roles.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => setDraft({ ...draft, role: role.value })}
                className={`grid gap-1 rounded-xl border p-3 text-left ${
                  draft.role === role.value ? "border-accent bg-accent-soft shadow-[0_0_0_3px_var(--color-accent-ring)]" : "border-border bg-surface"
                }`}
              >
                <span className="font-bold">{role.label}</span>
                <span className="text-[13px] text-muted">{role.description}</span>
              </button>
            ))}
          </div>
        </div>
        {draft.role === "member" ? (
          <div className="grid gap-2">
            <span className="text-[13px] text-muted">Business access</span>
            <div className="flex flex-wrap gap-2">
              {businesses.map((biz) => {
                const on = draft.business_ids.includes(biz.id);
                return (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, business_ids: on ? draft.business_ids.filter((id) => id !== biz.id) : [...draft.business_ids, biz.id] })}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted"}`}
                  >
                    {biz.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {error ? <p className="m-0 text-danger">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <IconButton type="button" onClick={onClose}>
            Cancel
          </IconButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving..." : editing ? "Save" : "Create user"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      await apiClient.resetUserPassword(user.id, password);
      onSaved(`Password for ${user.display_name} changed. They have been signed out everywhere.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Reset password" description={user.email} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <LabeledField label="New password (min 8 characters)">
          <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
        </LabeledField>
        {error ? <p className="m-0 text-danger">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <IconButton type="button" onClick={onClose}>
            Cancel
          </IconButton>
          <PrimaryButton type="submit">Set password</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { me, businesses } = useApp();
  const usersRes = useResource(() => apiClient.listUsers(), []);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState(null);

  function saved(text) {
    setModal(null);
    setMessage({ ok: true, text });
    usersRes.reload({ silent: true });
  }

  async function remove(user) {
    if (!confirm(`Remove ${user.display_name}? They will lose access immediately.`)) return;
    try {
      await apiClient.deleteUser(user.id);
      saved(`${user.display_name} removed.`);
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }

  if (me.role === "member") return <div className="rounded-lg border border-border bg-surface p-7 text-muted">Only owners and admins can manage users.</div>;

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Users" description="Give teammates their own login and control which businesses they can see.">
        <PrimaryButton type="button" onClick={() => setModal({ type: "user" })}>
          Add user
        </PrimaryButton>
      </PageHeader>
      {message ? <p className={`m-0 text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}

      <Card>
        {usersRes.loading ? (
          <SkeletonRows count={3} />
        ) : usersRes.error ? (
          <p className="m-0 text-danger">{usersRes.error}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>Last login</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {usersRes.data.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[image:var(--brand-gradient)] text-sm font-bold text-white">
                        {initials(user.display_name)}
                      </span>
                      <div className="grid">
                        <strong>
                          {user.display_name}
                          {user.id === me.id ? <span className="font-normal text-muted"> (you)</span> : null}
                        </strong>
                        <span className="text-[13px] text-muted">{user.email}</span>
                      </div>
                    </div>
                  </Td>
                  <Td className="align-middle">
                    <StatusPill tone={user.role === "owner" ? "success" : user.role === "admin" ? "warning" : "muted"}>
                      {user.role[0].toUpperCase() + user.role.slice(1)}
                    </StatusPill>
                  </Td>
                  <Td className="align-middle">
                    {user.role === "member" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {user.businesses.length === 0 ? <span className="text-[13px] text-muted">No access</span> : null}
                        {user.businesses.map((id) => (
                          <span key={id} className="rounded-full border border-border bg-surface-muted px-2 py-[3px] text-xs">
                            {businesses.find((b) => b.id === id)?.name ?? "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted">All businesses</span>
                    )}
                  </Td>
                  <Td className="align-middle text-[13px] whitespace-nowrap text-muted">{user.last_login ? formatDateTime(user.last_login) : "Never"}</Td>
                  <Td className="align-middle">
                    {user.role !== "owner" ? (
                      <div className="flex justify-end gap-2">
                        <IconButton type="button" onClick={() => setModal({ type: "user", user })}>
                          Edit
                        </IconButton>
                        <IconButton type="button" onClick={() => setModal({ type: "password", user })}>
                          Reset password
                        </IconButton>
                        {user.id !== me.id ? (
                          <IconButton tone="danger" type="button" onClick={() => remove(user)}>
                            Remove
                          </IconButton>
                        ) : null}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === "user" ? <UserModal user={modal.user} businesses={businesses} onClose={() => setModal(null)} onSaved={saved} /> : null}
      {modal?.type === "password" ? <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} onSaved={saved} /> : null}
    </div>
  );
}
