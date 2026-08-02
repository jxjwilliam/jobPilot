"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Send,
  CheckCircle,
  ChevronRight,
  ArrowLeft,
  Target,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";

type InterviewQuestion = {
  question: string;
  category: string;
  tip?: string;
};

type InterviewFeedback = {
  score: number;
  strengths: string[];
  improvements: string[];
  star_assessment?: {
    situation?: number;
    task?: number;
    action?: number;
    result?: number;
  };
  overall_comment: string;
};

type AnswerEntry = {
  question: string;
  category: string;
  answer: string;
  feedback: InterviewFeedback;
  evaluated_at: string;
} | null;

function categoryBadge(cat: string): string {
  const map: Record<string, string> = {
    technical: "bg-blue-100 text-blue-800 border-blue-200",
    behavioral: "bg-purple-100 text-purple-800 border-purple-200",
    company: "bg-emerald-100 text-emerald-800 border-emerald-200",
    scenario: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return map[cat] ?? "bg-neutral-100 text-neutral-700 border-neutral-200";
}

function scoreColor(s: number): string {
  if (s >= 8) return "text-emerald-600";
  if (s >= 6) return "text-amber-600";
  return "text-red-500";
}

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const postingId = params.id;

  const [phase, setPhase] = useState<"loading" | "ready" | "answering" | "completed">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [posting, setPosting] = useState<{ title: string; company_name: string } | null>(
    null
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const startInterview = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posting_id: postingId }),
      });
      const data = (await res.json()) as {
        session_id?: string;
        questions?: InterviewQuestion[];
        posting?: { title: string; company_name: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setSessionId(data.session_id!);
      setQuestions(data.questions ?? []);
      setPosting(data.posting ?? null);
      setAnswers(new Array(data.questions?.length ?? 0).fill(null));
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [postingId]);

  useEffect(() => {
    void startInterview();
  }, [startInterview]);

  function startAnswering() {
    setPhase("answering");
    setCurrentIndex(0);
    setCurrentAnswer("");
  }

  async function submitAnswer() {
    if (!sessionId || !currentAnswer.trim()) return;
    setEvaluating(true);
    setError(null);

    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_index: currentIndex,
          answer: currentAnswer,
        }),
      });
      const data = (await res.json()) as {
        feedback?: InterviewFeedback;
        completed?: number;
        total_questions?: number;
        session_status?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Evaluation failed");

      const newAnswers = [...answers];
      newAnswers[currentIndex] = {
        question: questions[currentIndex].question,
        category: questions[currentIndex].category,
        answer: currentAnswer,
        feedback: data.feedback!,
        evaluated_at: new Date().toISOString(),
      };
      setAnswers(newAnswers);

      if (data.session_status === "completed") {
        setPhase("completed");
      } else if (currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
        setCurrentAnswer("");
      } else {
        setPhase("completed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  if (generating || phase === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="mt-4 h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error && !sessionId) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not start interview"
        description={error}
        actions={[
          { label: "Back to matches", href: "/matches", variant: "default" },
        ]}
      />
    );
  }

  if (phase === "completed") {
    const evaluated = answers.filter((a) => a?.feedback) as Array<
      NonNullable<AnswerEntry>
    >;
    const avgScore =
      evaluated.length > 0
        ? evaluated.reduce((sum, a) => sum + a.feedback.score, 0) / evaluated.length
        : 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/matches">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Interview Complete
            </h1>
            <p className="text-sm text-muted-foreground">
              {posting?.title} at {posting?.company_name}
            </p>
          </div>
        </div>

        {/* Summary card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Overall Score:{" "}
              <span className={scoreColor(avgScore)}>
                {avgScore.toFixed(1)} / 10
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {evaluated.length} of {questions.length} questions answered
            {avgScore >= 8
              ? " — Excellent performance! You're well-prepared for this role."
              : avgScore >= 6
                ? " — Solid performance. Focus on the improvement areas below."
                : " — Keep practicing. Review the feedback and try again."}
          </CardContent>
        </Card>

        {/* Question-by-question results */}
        <div className="space-y-4">
          {questions.map((q, i) => {
            const entry = answers[i];
            const fb = entry?.feedback;
            return (
              <Card key={i} className={!fb ? "opacity-50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${categoryBadge(q.category)}`}
                      >
                        {q.category}
                      </Badge>
                      <p className="mt-1 font-medium text-sm">{q.question}</p>
                    </div>
                    {fb ? (
                      <span
                        className={`shrink-0 text-lg font-bold ${scoreColor(fb.score)}`}
                      >
                        {fb.score}/10
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Not answered
                      </span>
                    )}
                  </div>
                </CardHeader>
                {fb ? (
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{fb.overall_comment}</p>
                    {fb.strengths.length > 0 ? (
                      <div>
                        <span className="font-medium text-emerald-700">
                          Strengths:
                        </span>{" "}
                        {fb.strengths.join(" · ")}
                      </div>
                    ) : null}
                    {fb.improvements.length > 0 ? (
                      <div>
                        <span className="font-medium text-amber-700">
                          To improve:
                        </span>{" "}
                        {fb.improvements.join(" · ")}
                      </div>
                    ) : null}
                    {fb.star_assessment &&
                    Object.values(fb.star_assessment).some(
                      (v) => v != null
                    ) ? (
                      <div className="flex gap-3 text-xs text-muted-foreground pt-1">
                        {fb.star_assessment.situation != null ? (
                          <span>S: {fb.star_assessment.situation}/5</span>
                        ) : null}
                        {fb.star_assessment.task != null ? (
                          <span>T: {fb.star_assessment.task}/5</span>
                        ) : null}
                        {fb.star_assessment.action != null ? (
                          <span>A: {fb.star_assessment.action}/5</span>
                        ) : null}
                        {fb.star_assessment.result != null ? (
                          <span>R: {fb.star_assessment.result}/5</span>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => void startInterview()}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            Retake interview
          </Button>
          <Link href="/matches">
            <Button variant="outline">Back to matches</Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/matches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Mock Interview
          </h1>
          <p className="text-sm text-muted-foreground">
            {posting?.title} at {posting?.company_name}
          </p>
        </div>
      </div>

      {phase === "ready" ? (
        <Card>
          <CardHeader>
            <CardTitle>Your interview is ready</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We generated {questions.length} questions based on the job
              description. Categories:
            </p>
            <div className="flex flex-wrap gap-2">
              {["technical", "behavioral", "company", "scenario"].map((cat) => {
                const count = questions.filter((q) => q.category === cat).length;
                if (count === 0) return null;
                return (
                  <Badge
                    key={cat}
                    variant="outline"
                    className={categoryBadge(cat)}
                  >
                    {cat} ({count})
                  </Badge>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground pt-2">
              Answer each question in writing. Your answers will be scored on
              relevance, specificity, structure, and impact.
            </p>
            <Button onClick={startAnswering} className="mt-2">
              Start interview
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === "answering" && currentQuestion ? (
        <div className="space-y-4">
          {/* Progress */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Question {currentIndex + 1} of {questions.length}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.round(((currentIndex + 1) / questions.length) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Question card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${categoryBadge(currentQuestion.category)}`}
                >
                  {currentQuestion.category}
                </Badge>
              </div>
              <CardTitle className="text-base mt-1">
                {currentQuestion.question}
              </CardTitle>
            </CardHeader>
            {currentQuestion.tip ? (
              <CardContent className="pb-2">
                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span className="text-muted-foreground">
                    {currentQuestion.tip}
                  </span>
                </div>
              </CardContent>
            ) : null}
          </Card>

          {/* Answer input */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Your answer</label>
            <textarea
              className="w-full min-h-32 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Type your answer here…"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              disabled={evaluating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  void submitAnswer();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {evaluating
                  ? "Evaluating your answer…"
                  : "⌘+Enter to submit"}
              </p>
              <Button
                onClick={() => void submitAnswer()}
                disabled={evaluating || !currentAnswer.trim()}
              >
                {evaluating ? (
                  <>
                    <span className="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Evaluating…
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" />
                    Submit answer
                  </>
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
