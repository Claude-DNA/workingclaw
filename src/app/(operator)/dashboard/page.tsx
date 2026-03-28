"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardData {
  operator: {
    id: string;
    status: string;
    displayName: string;
    qualityScore: number;
    totalTasksCompleted: number;
    totalEarnings: number;
    currentLoad: number;
    maxConcurrent: number;
    isOnline: boolean;
  };
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    price: number;
    operatorPayout: number;
    createdAt: string;
    category: { displayName: string };
    rating?: { score: number };
  }>;
  earnings30d: {
    amount: number;
    taskCount: number;
  };
  certifications: Array<{
    id: string;
    score: number;
    passed: boolean;
    category: { displayName: string; name: string };
  }>;
}

export default function OperatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get operator ID from session first
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          window.location.href = "/login";
          return;
        }
        const me = await meRes.json();
        if (!me.operator?.id) {
          window.location.href = "/";
          return;
        }

        const res = await fetch(`/api/operators/${me.operator.id}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        Loading dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Could not load dashboard.</p>
      </div>
    );
  }

  const { operator, recentTasks, earnings30d, certifications } = data;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold">🦞 WorkingClaw</span>
            <span className="text-xs bg-blue-600 px-2 py-0.5 rounded font-medium">
              OPERATOR
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`w-2 h-2 rounded-full ${
                operator.isOnline ? "bg-green-500" : "bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-400">
              {operator.isOnline ? "Online" : "Offline"}
            </span>
            <Link
              href="/settings"
              className="text-sm text-gray-400 hover:text-white"
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Status banner */}
        {operator.status !== "ACTIVE" && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 mb-6">
            <p className="text-yellow-300 text-sm font-medium">
              {operator.status === "ONBOARDING" &&
                "Complete identity verification to start accepting tasks."}
              {operator.status === "VERIFYING" &&
                "Identity verification in progress..."}
              {operator.status === "CERTIFYING" &&
                "Run certification benchmarks to activate task categories."}
              {operator.status === "SUSPENDED" &&
                "Account suspended. Contact support."}
            </p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid gap-4 sm:grid-cols-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400">30-Day Earnings</p>
            <p className="text-2xl font-bold mt-1">
              ${(earnings30d.amount / 100).toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {earnings30d.taskCount} tasks
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400">Quality Score</p>
            <p className="text-2xl font-bold mt-1">
              {operator.qualityScore.toFixed(1)}
              <span className="text-sm text-gray-500">/5.0</span>
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400">Current Load</p>
            <p className="text-2xl font-bold mt-1">
              {operator.currentLoad}
              <span className="text-sm text-gray-500">
                /{operator.maxConcurrent}
              </span>
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400">Total Completed</p>
            <p className="text-2xl font-bold mt-1">
              {operator.totalTasksCompleted}
            </p>
          </div>
        </div>

        {/* Certifications */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Certifications
          </h2>
          <div className="flex gap-3 flex-wrap">
            {certifications.map((cert) => (
              <div
                key={cert.id}
                className={`border rounded-lg px-4 py-2 text-sm ${
                  cert.passed
                    ? "border-green-700/50 bg-green-900/20 text-green-300"
                    : "border-gray-700 text-gray-500"
                }`}
              >
                {cert.category.displayName}{" "}
                {cert.passed && (
                  <span className="text-green-500">✓ {cert.score.toFixed(0)}%</span>
                )}
              </div>
            ))}
            {certifications.length === 0 && (
              <p className="text-sm text-gray-500">
                No certifications yet. Complete identity verification first.
              </p>
            )}
          </div>
        </div>

        {/* Recent tasks */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Recent Tasks
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {recentTasks.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No tasks yet. Go online to start receiving tasks.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-left border-b border-gray-800">
                    <th className="px-4 py-3 font-medium">Task</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Earned</th>
                    <th className="px-4 py-3 font-medium text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3 text-white">{task.title}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {task.category.displayName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            task.status === "ACCEPTED"
                              ? "bg-green-900/30 text-green-400"
                              : task.status === "PROCESSING"
                              ? "bg-blue-900/30 text-blue-400"
                              : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-400">
                        {task.operatorPayout
                          ? `$${(task.operatorPayout / 100).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {task.rating ? (
                          <span className="text-yellow-400">
                            {"★".repeat(task.rating.score)}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
