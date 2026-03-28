"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const CATEGORIES: Record<
  string,
  {
    title: string;
    price: string;
    priceCents: number;
    placeholder: string;
    titlePlaceholder: string;
    icon: string;
  }
> = {
  "document-summary": {
    title: "Summarize a Document",
    price: "$2.00",
    priceCents: 200,
    icon: "📄",
    titlePlaceholder: "e.g., Q4 Sales Report Summary",
    placeholder:
      "Paste the text you want summarized, or describe the document. What should the summary focus on? How long should it be?",
  },
  "email-draft": {
    title: "Draft a Professional Email",
    price: "$2.00",
    priceCents: 200,
    icon: "✉️",
    titlePlaceholder: "e.g., Follow-up to job interview",
    placeholder:
      "Who is the email to? What's the situation? What tone — formal, friendly, firm? Any specific points to include?",
  },
  "content-writing": {
    title: "Write Content",
    price: "$3.00",
    priceCents: 300,
    icon: "✍️",
    titlePlaceholder: "e.g., Blog post about remote work productivity",
    placeholder:
      "What type of content? Who's the audience? What's the topic? Any specific length, tone, or points to cover?",
  },
};

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitPageContent />
    </Suspense>
  );
}

function SubmitPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categorySlug = searchParams.get("category") || "document-summary";
  const category = CATEGORIES[categorySlug] || CATEGORIES["document-summary"];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please give your task a title.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categorySlug, // Will be resolved to actual ID server-side
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          router.push(`/login?redirect=/submit?category=${categorySlug}`);
          return;
        }
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      const task = await res.json();
      router.push(`/tasks/${task.id}`);
    } catch {
      setError("Connection error. Please check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            🦞 WorkingClaw
          </Link>
          <Link
            href="/tasks"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            My Tasks
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Category header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">{category.icon}</span>
          <div>
            <h1 className="text-2xl font-bold">{category.title}</h1>
            <p className="text-sm text-gray-500">
              Results typically arrive in 2-5 minutes
            </p>
          </div>
        </div>

        {/* Task form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              What do you need?
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={category.titlePlaceholder}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              maxLength={200}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Details{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={category.placeholder}
              rows={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base resize-none"
              maxLength={5000}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {description.length}/5000
            </p>
          </div>

          {/* TODO: File upload for document summary */}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Price and submit */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total price</p>
              <p className="text-2xl font-bold">{category.price}</p>
              <p className="text-xs text-gray-400 mt-1">
                Money-back guarantee if not satisfied
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Task"}
            </button>
          </div>
        </form>

        {/* Category switcher */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-400 mb-3">
            Looking for something else?
          </p>
          <div className="flex gap-3">
            {Object.entries(CATEGORIES)
              .filter(([slug]) => slug !== categorySlug)
              .map(([slug, cat]) => (
                <Link
                  key={slug}
                  href={`/submit?category=${slug}`}
                  className="text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  {cat.icon} {cat.title}
                </Link>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
