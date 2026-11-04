"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import PrimaryButton from "@/components/ui/PrimaryButton";
import { inputClass, LabeledField } from "@/components/ui/fields";
import { useApp } from "@/components/AppContext";
import { apiClient, errorMessage } from "@/lib/api";

export default function ProfilePage() {
  const { me, setMe } = useApp();
  const [name, setName] = useState(me.display_name);
  const [profileMessage, setProfileMessage] = useState(null);
  const [passwordMessage, setPasswordMessage] = useState(null);

  async function saveProfile(e) {
    e.preventDefault();
    try {
      const updated = await apiClient.updateMe({ display_name: name });
      setMe({ ...me, ...updated });
      setProfileMessage({ ok: true, text: "Profile updated." });
    } catch (err) {
      setProfileMessage({ ok: false, text: errorMessage(err) });
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    if (form.get("new_password") !== form.get("confirm_password")) {
      setPasswordMessage({ ok: false, text: "New passwords do not match." });
      return;
    }
    try {
      await apiClient.changeMyPassword({ current_password: form.get("current_password"), new_password: form.get("new_password") });
      formEl.reset();
      setPasswordMessage({ ok: true, text: "Password changed." });
    } catch (err) {
      setPasswordMessage({ ok: false, text: errorMessage(err) });
    }
  }

  const status = (message) =>
    message ? <span className={`text-[13px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span> : null;

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Profile" description={`${me.tenant_name} · ${me.role[0].toUpperCase() + me.role.slice(1)}`} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <Card>
          <h2 className="m-0 mb-4 text-lg font-bold">Details</h2>
          <form onSubmit={saveProfile} className="grid gap-4">
            <LabeledField label="Full name">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </LabeledField>
            <LabeledField label="Email">
              <input disabled value={me.email} className={`${inputClass} bg-surface-muted text-muted`} />
            </LabeledField>
            <div className="flex items-center gap-3">
              <PrimaryButton type="submit">Save profile</PrimaryButton>
              {status(profileMessage)}
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="m-0 mb-4 text-lg font-bold">Change password</h2>
          <form onSubmit={changePassword} className="grid gap-4">
            <LabeledField label="Current password">
              <input name="current_password" type="password" required autoComplete="current-password" className={inputClass} />
            </LabeledField>
            <LabeledField label="New password">
              <input name="new_password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
            </LabeledField>
            <LabeledField label="Confirm new password">
              <input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
            </LabeledField>
            <div className="flex items-center gap-3">
              <PrimaryButton type="submit">Update password</PrimaryButton>
              {status(passwordMessage)}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
