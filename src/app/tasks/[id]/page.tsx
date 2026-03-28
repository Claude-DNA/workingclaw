"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  price: number;
  createdAt: string;
  completedAt?: string;
  category: { displayName: string };
  rating?: { score: number };
  dispute?: { status: string };
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: "Finding an expert...", color: "text-yellow-600" },
  QUEUED: { label: "Expert assigned, starting soon", color: "text-blue-600" },
  PROCESSING: { label: "Working on it...", color: "text-blue-600" },
  COMPLETED: { label: "Ready for review", color: "text-green-600" },
  ACCEPTED: { label: "Completed", color: "text-green-700" },
  DISPUTED: { label: "Under review", color: "text-orange-600" },
  REPLAYED: { label: "Being redone by a different expert", color: "text-blue-600" },
  REFUNDED: { label: "Refunded", color: "text-gray-600" },
  EXPIRED: { label: "No experts available — refunded", color: "text-red-600" },
  CANCELLED: { label: "Cancelled", color: "text-gray-500" },
};

export default function TaskPage() {
  const { id } = useParams();
  const router = useRouter();
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [showDispute, setShowDispute] = useState(false);

  useEffect(() => {
    fetchTask();
    // Poll for status updates while task is in progress
    const interval = setInterval(fetchTask, 5000);
    return () => clearInterval(interval);
  }, [id]);

  async function fetchTask() {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTask(data);
        // Stop polling if task is in final state
        if (["ACCEPTED", "REFUNDED", "CANCELLED", "EXPIRED"].includes(data.status)) {
          // Could clear interval here
        }
      }
    } catch {
      // Silent retry on poll
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    fetchTask();
  }

  async function handleRate(score: number) {
    setRating(score);
    await fetch(`/api/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rate", score }),
    });
    fetchTask();
  }

  async function handleDispute(reason: string, requestReplay: boolean) {
    await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: id,
        reason,
        requestReplay,
      }),
    });
    setShowDispute(false);
    fetchTask();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Task not found</p>
          <Link href="/tasks" className="text-blue-600 text-sm mt-2 inline-block">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_DISPLAY[task.status] || { label: task.status, color: "text-gray-600" };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            🦞 WorkingClaw
          </Link>
          <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-900">
            My Tasks
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Status */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">{task.title}</h1>
            <span className="text-sm text-gray-400">
              ${(task.price / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {["SUBMITTED", "QUEUED", "PROCESSING"].includes(task.status) && (
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {task.category.displayName} — submitted{" "}
            {new Date(task.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Result (when completed) */}
        {task.status === "COMPLETED" && (
          <div className="bg-white border border-green-200 rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-green-700 mb-3">
              Your result is ready
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-700">
              {/* Result content would be loaded here */}
              <p className="text-gray-400 italic">
                [Result content displayed here]
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Accept & Pay
              </button>
              <button
                onClick={() => setShowDispute(true)}
                className="border border-gray-200 text-gray-600 px-6 py-2 rounded-lg text-sm hover:border-gray-300"
              >
                Not satisfied
              </button>
            </div>
          </div>
        )}

        {/* Dispute form */}
        {showDispute && (
          <div className="bg-white border border-orange-200 rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-orange-700 mb-3">
              What went wrong?
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => handleDispute("LOW_QUALITY", true)}
                className="w-full text-left border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <p className="font-medium text-sm">Redo with a different expert</p>
                <p className="text-xs text-gray-400 mt-1">
                  Free replay — same task, different expert. If still not good, full refund.
                </p>
              </button>
              <button
                onClick={() => handleDispute("LOW_QUALITY", false)}
                className="w-full text-left border border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors"
              >
                <p className="font-medium text-sm">Request a refund</p>
                <p className="text-xs text-gray-400 mt-1">
                  We&apos;ll review and process your refund within 24 hours.
                </p>
              </button>
              <button
                onClick={() => setShowDispute(false)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rating (after acceptance) */}
        {task.status === "ACCEPTED" && !task.rating && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="font-semibold mb-3">How was the result?</h2>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRate(star)}
                  className={`text-2xl transition-colors ${
                    star <= rating ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        )}

        {task.description && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-500 mb-2">
              Your brief
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {task.description}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
