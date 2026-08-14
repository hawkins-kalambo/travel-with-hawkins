"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";
import CustomerShell from "@/app/customer/_components/CustomerShell";

export default function CustomerSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"notifications" | "privacy" | "security">("notifications");
  const [settings, setSettings] = useState({
    emailNotifications: true,
    notifyBookingConfirmed: true,
    notifyTripReminder: true,
    notifyAnnouncements: true,
    profileVisibility: "private",
    showBookingHistory: true,
    newsletterSubscription: true,
    promotionalEmails: true,
    twoFactorEnabled: false,
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.push("/customer/login");
          return;
        }

        const [settingsRes, profileRes] = await Promise.all([
          fetch("/api/customers/settings"),
          fetch("/api/customers/profile"),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.success && data.settings) {
            setSettings((prev) => ({ ...prev, ...data.settings }));
          }
        }

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.profile) {
            setProfile(profileData.profile);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [router]);

  const handleToggle = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key as keyof typeof settings],
    }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/customers/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to save settings");
        return;
      }

      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const handleChangePassword = () => {
    router.push("/reset-password");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <CustomerShell active="settings" profile={profile} title="Settings" subtitle="Manage your account preferences and security">
      <div className="mx-auto max-w-4xl">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-4">
          {/* Sidebar Navigation */}
          <div className="space-y-2 lg:col-span-1">
            <button
              onClick={() => setActiveTab("notifications")}
              className={`w-full text-left rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === "notifications"
                  ? "bg-[#0A4D8C] text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              🔔 Notifications
            </button>

            <button
              onClick={() => setActiveTab("privacy")}
              className={`w-full text-left rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === "privacy"
                  ? "bg-[#0A4D8C] text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              👁️ Privacy
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`w-full text-left rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === "security"
                  ? "bg-[#0A4D8C] text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              🔐 Security
            </button>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            {/* Notifications Tab */}
            {activeTab === "notifications" && (
              <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Notification Preferences</h2>
                  <p className="mt-1 text-sm text-slate-600">Choose how we keep you updated</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Email Notifications</p>
                      <p className="text-sm text-slate-600">Receive updates via email</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.emailNotifications}
                        onChange={() => handleToggle("emailNotifications")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Booking Confirmations</p>
                      <p className="text-sm text-slate-600">Get notified when bookings are confirmed</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.notifyBookingConfirmed}
                        onChange={() => handleToggle("notifyBookingConfirmed")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Trip Reminders</p>
                      <p className="text-sm text-slate-600">Receive reminders before your trips</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.notifyTripReminder}
                        onChange={() => handleToggle("notifyTripReminder")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Announcements</p>
                      <p className="text-sm text-slate-600">Important updates and announcements</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.notifyAnnouncements}
                        onChange={() => handleToggle("notifyAnnouncements")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            )}

            {/* Privacy Tab */}
            {activeTab === "privacy" && (
              <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Privacy Settings</h2>
                  <p className="mt-1 text-sm text-slate-600">Control who can see your information</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <label htmlFor="profileVisibility" className="mb-2 block text-sm font-semibold text-slate-700">
                      Profile Visibility
                    </label>
                    <select
                      id="profileVisibility"
                      name="profileVisibility"
                      value={settings.profileVisibility}
                      onChange={handleSelectChange}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    >
                      <option value="private">Private (Only you can see)</option>
                      <option value="public">Public (Everyone can see)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Show Booking History</p>
                      <p className="text-sm text-slate-600">Allow others to see your bookings</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.showBookingHistory}
                        onChange={() => handleToggle("showBookingHistory")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Newsletter Subscription</p>
                      <p className="text-sm text-slate-600">Receive our weekly newsletter</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.newsletterSubscription}
                        onChange={() => handleToggle("newsletterSubscription")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Promotional Emails</p>
                      <p className="text-sm text-slate-600">Special offers and promotions</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.promotionalEmails}
                        onChange={() => handleToggle("promotionalEmails")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Security Settings</h2>
                  <p className="mt-1 text-sm text-slate-600">Protect your account</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <div className="mb-4">
                      <p className="font-semibold text-slate-900">Password</p>
                      <p className="text-sm text-slate-600">Change your password regularly</p>
                    </div>
                    <button
                      onClick={handleChangePassword}
                      className="rounded-2xl bg-[#F7931E] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#e67e0f]"
                    >
                      Change Password
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">Two-Factor Authentication</p>
                      <p className="text-sm text-slate-600">Add extra security to your account</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.twoFactorEnabled}
                        onChange={() => handleToggle("twoFactorEnabled")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A4D8C]/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0A4D8C]"></div>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="font-semibold text-red-900">Sign Out</p>
                    <p className="mt-1 text-sm text-red-800">End your session on this device</p>
                    <button
                      onClick={handleLogout}
                      className="mt-4 rounded-2xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Sign Out Now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
