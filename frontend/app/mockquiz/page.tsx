"use client";

import { useEffect, useMemo, useState } from "react";

type SavedChat = {
  id: string;
  title: string;
  updated: string;
  docs: number;
  messages: number;
  difficulty: "Easy" | "Medium" | "Hard";
  estimatedQuestions: number;
  subject: string;
  description: string;
  tags: string[];
};

type MockQuestion = {
  id: number;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

const savedChats: SavedChat[] = [
  {
    id: "chat-1",
    title: "ECON Final Study",
    updated: "2 hours ago",
    docs: 3,
    messages: 42,
    difficulty: "Medium",
    estimatedQuestions: 20,
    subject: "Economics",
    description: "Includes lecture notes, practice discussions, and summary sheets.",
    tags: ["Final", "Macro", "Graphs"],
  },
  {
    id: "chat-2",
    title: "AI Midterm Notes",
    updated: "Yesterday",
    docs: 2,
    messages: 28,
    difficulty: "Hard",
    estimatedQuestions: 15,
    subject: "Artificial Intelligence",
    description: "Built from concepts, algorithms, and previous quiz explanations.",
    tags: ["Midterm", "Search", "Heuristics"],
  },
  {
    id: "chat-3",
    title: "Algorithms Exam Prep",
    updated: "Today",
    docs: 4,
    messages: 51,
    difficulty: "Hard",
    estimatedQuestions: 25,
    subject: "Algorithms",
    description: "Practice from divide and conquer, heaps, DP, and greedy methods.",
    tags: ["DP", "Greedy", "Trees"],
  },
  {
    id: "chat-4",
    title: "Database Systems Review",
    updated: "3 days ago",
    docs: 1,
    messages: 19,
    difficulty: "Easy",
    estimatedQuestions: 12,
    subject: "Databases",
    description: "Covers SQL, normalization, indexing, and schema design.",
    tags: ["SQL", "ERD", "Indexing"],
  },
  {
    id: "chat-5",
    title: "Statistics Refresher",
    updated: "Last week",
    docs: 2,
    messages: 33,
    difficulty: "Medium",
    estimatedQuestions: 18,
    subject: "Statistics",
    description: "Probability, hypothesis testing, distributions, and inference.",
    tags: ["Probability", "Tests", "Inference"],
  },
];

const mockQuestionsByChat: Record<string, MockQuestion[]> = {
  "chat-1": [
    {
      id: 1,
      prompt: "Which of the following best explains cost-push inflation?",
      options: [
        "A rise in aggregate demand only",
        "An increase in production costs that shifts supply left",
        "A fall in consumer confidence",
        "A decrease in government spending",
      ],
      answer: 1,
      explanation:
        "Cost-push inflation happens when higher input costs reduce aggregate supply, pushing the price level upward.",
    },
    {
      id: 2,
      prompt: "What is the main purpose of fiscal policy during a recession?",
      options: [
        "To reduce investment immediately",
        "To shrink GDP growth",
        "To stabilize output using taxes and government spending",
        "To eliminate all inflation permanently",
      ],
      answer: 2,
      explanation:
        "Fiscal policy uses government spending and taxation to support output and demand during downturns.",
    },
    {
      id: 3,
      prompt: "If interest rates rise, which outcome is most likely in the short run?",
      options: [
        "Borrowing becomes cheaper",
        "Investment spending may fall",
        "Consumption automatically doubles",
        "Imports become zero",
      ],
      answer: 1,
      explanation:
        "Higher interest rates usually make borrowing more expensive, which can reduce investment spending.",
    },
  ],
  "chat-2": [
    {
      id: 1,
      prompt: "Which search algorithm expands the node with the lowest estimated total cost f(n)?",
      options: ["DFS", "BFS", "A*", "Hill Climbing"],
      answer: 2,
      explanation:
        "A* chooses the node with the smallest f(n) = g(n) + h(n), balancing path cost and heuristic estimate.",
    },
    {
      id: 2,
      prompt: "What is a heuristic in AI search?",
      options: [
        "A guaranteed optimal policy",
        "A rule of thumb estimating distance to a goal",
        "A type of dataset split",
        "A supervised loss function",
      ],
      answer: 1,
      explanation:
        "A heuristic is an estimate used to guide search toward promising states faster.",
    },
    {
      id: 3,
      prompt: "Which statement about admissible heuristics is correct?",
      options: [
        "They always overestimate the true cost",
        "They never overestimate the true cost to the goal",
        "They are only used in uninformed search",
        "They guarantee depth-first optimality",
      ],
      answer: 1,
      explanation:
        "An admissible heuristic never overestimates the actual remaining cost.",
    },
  ],
  "chat-3": [
    {
      id: 1,
      prompt: "Which strategy is most closely associated with dynamic programming?",
      options: [
        "Solving overlapping subproblems once and storing results",
        "Trying all possibilities without memory",
        "Always choosing the locally best edge",
        "Traversing only leaf nodes",
      ],
      answer: 0,
      explanation:
        "Dynamic programming improves efficiency by reusing previously computed results for overlapping subproblems.",
    },
    {
      id: 2,
      prompt: "Heapsort has which worst-case time complexity?",
      options: ["O(n)", "O(n log n)", "O(log n)", "O(n^2 log n)"],
      answer: 1,
      explanation:
        "Heapsort builds a heap and repeatedly extracts the maximum or minimum in O(n log n) time.",
    },
    {
      id: 3,
      prompt: "Which algorithm is a classic greedy algorithm?",
      options: ["Floyd-Warshall", "Merge Sort", "Dijkstra’s Algorithm", "Binary Search"],
      answer: 2,
      explanation:
        "Dijkstra’s algorithm greedily selects the next closest unvisited node when edge weights are nonnegative.",
    },
  ],
  "chat-4": [
    {
      id: 1,
      prompt: "What does 3NF primarily help reduce?",
      options: [
        "Rendering latency",
        "Transitive dependency issues",
        "Primary keys",
        "All joins",
      ],
      answer: 1,
      explanation:
        "Third Normal Form removes transitive dependencies to improve consistency and reduce redundancy.",
    },
    {
      id: 2,
      prompt: "Which SQL clause is used to filter grouped results?",
      options: ["WHERE", "ORDER BY", "HAVING", "LIMIT"],
      answer: 2,
      explanation:
        "HAVING filters aggregated groups after GROUP BY is applied.",
    },
    {
      id: 3,
      prompt: "What is the main benefit of an index?",
      options: [
        "It guarantees no duplicate rows",
        "It can speed up data retrieval",
        "It stores all backups automatically",
        "It replaces normalization",
      ],
      answer: 1,
      explanation:
        "Indexes improve lookup speed for queries, though they may increase write overhead.",
    },
  ],
  "chat-5": [
    {
      id: 1,
      prompt: "What does a p-value represent?",
      options: [
        "The probability the null hypothesis is true",
        "The chance of observing data at least as extreme under the null",
        "The sample size of a test",
        "The mean of the population",
      ],
      answer: 1,
      explanation:
        "A p-value measures how extreme the observed result would be if the null hypothesis were true.",
    },
    {
      id: 2,
      prompt: "Which distribution is commonly used for small-sample mean tests when sigma is unknown?",
      options: ["Normal", "Poisson", "t-distribution", "Uniform"],
      answer: 2,
      explanation:
        "The t-distribution is typically used for inference about means when population variance is unknown.",
    },
    {
      id: 3,
      prompt: "What does a confidence interval provide?",
      options: [
        "A range of plausible values for a parameter",
        "A guaranteed true value",
        "A list of raw observations",
        "A fixed error with no assumptions",
      ],
      answer: 0,
      explanation:
        "A confidence interval gives a plausible range for the population parameter based on the sample.",
    },
  ],
};

type ViewState = "landing" | "testing" | "results";

export default function MockQuizPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewState>("landing");
  const [selectedChat, setSelectedChat] = useState<SavedChat | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [timeLeft, setTimeLeft] = useState(12 * 60);
  const [reviewOpen, setReviewOpen] = useState<Record<number, boolean>>({});

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return savedChats;
    return savedChats.filter((chat) => {
      return (
        chat.title.toLowerCase().includes(query) ||
        chat.subject.toLowerCase().includes(query) ||
        chat.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [search]);

  const questions = selectedChat ? mockQuestionsByChat[selectedChat.id] ?? [] : [];
  const activeQuestion = questions[currentQuestion];

  const score = useMemo(() => {
    if (!questions.length) return 0;
    return questions.reduce((total, question, index) => {
      return total + (selectedAnswers[index] === question.answer ? 1 : 0);
    }, 0);
  }, [questions, selectedAnswers]);

    const missedQuestions = useMemo(() => {
    return questions.filter((question, index) => selectedAnswers[index] !== question.answer);
  }, [questions, selectedAnswers]);

  const progressPercent = questions.length
    ? ((currentQuestion + 1) / questions.length) * 100
    : 0;
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

    const buildWeakTopics = () => {
    if (!missedQuestions.length) {
      return [
        {
          title: "No weak topics detected",
          summary: "You answered every question correctly in this mock test.",
          action: "Generate a harder mock test or retry with a more difficult saved chat.",
        },
      ];
    }

    return missedQuestions.map((question, index) => ({
      title: `Weak Topic ${index + 1}`,
      summary: question.prompt,
      action: "Generate more questions from this topic to strengthen retention and accuracy.",
    }));
  };

  useEffect(() => {
    if (view !== "testing") return;
    if (timeLeft <= 0) {
      setView("results");
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [view, timeLeft]);

  const startMockTest = (chat: SavedChat) => {
    setSelectedChat(chat);
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowExplanation(false);
    setReviewOpen({});
    setTimeLeft(Math.max((mockQuestionsByChat[chat.id]?.length ?? 0) * 60, 12 * 60));
    setView("testing");
  };

  const handleAnswerSelect = (optionIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion]: optionIndex,
    }));
  };

  const handleNext = () => {
    setShowExplanation(false);
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      return;
    }
    setView("results");
  };

  const handleBackToLibrary = () => {
    setView("landing");
    setSelectedChat(null);
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowExplanation(false);
    setReviewOpen({});
    setTimeLeft(12 * 60);
  };

  const restartTest = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setShowExplanation(false);
    setReviewOpen({});
    setTimeLeft(Math.max(questions.length * 60, 12 * 60));
    setView("testing");
  };

  return (
    <>
      <div className="pu-bg" />
      <div className="pu-vignette" />

      <main className="pu-root">
        <div className="pu-shell">
          <aside className="pu-glass pu-sidebar">
            <div className="pu-brandRow">
              <div>
                <div className="pu-brand">Prepare-Up</div>
              </div>
            </div>

            <div className="pu-sectionLabel">Main</div>
            <div className="pu-sideNav">
              <button className="pu-sideItem" type="button">
                <span className="pu-sideIcon">▣</span>
                <span className="pu-sideLabel">Flash Cards</span>
              </button>

              <button className="pu-sideItem" type="button">
                <span className="pu-sideIcon">◉</span>
                <span className="pu-sideLabel">Podcast</span>
              </button>

              <button className="pu-sideItem active" type="button">
                <span className="pu-sideIcon">▤</span>
                <span className="pu-sideLabel">Mock Test</span>
              </button>

              <button className="pu-sideItem" type="button">
                <span className="pu-sideIcon">▥</span>
                <span className="pu-sideLabel">Study Guide</span>
              </button>
            </div>

            <div className="pu-sectionLabel">Recents</div>
            <div className="pu-search">
              <span className="pu-sideIcon">⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats..."
                aria-label="Search chats"
              />
            </div>

            <div className="pu-list">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  className="pu-itemCompact"
                  type="button"
                  onClick={() => startMockTest(chat)}
                >
                  <div className="pu-itemTitle">{chat.title}</div>
                  <div className="pu-itemSub">
                    {chat.subject} • {chat.docs} docs • {chat.messages} messages
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="pu-glass pu-main">
            <div className="pu-topbar">
              <div>
                <div className="pu-pageEyebrow">Mock Test Workspace</div>
                <div className="pu-pageTitle">
                  {view === "landing" && "Generate from saved chats"}
                  {view === "testing" && `Testing: ${selectedChat?.title ?? "Mock Test"}`}
                  {view === "results" && "Mock Test Results"}
                </div>
              </div>

        <div className="pu-topbarActions">
          {view !== "landing" && (
            <button className="pu-btn" type="button" onClick={handleBackToLibrary}>
              Back to Chats
            </button>
          )}
        </div>
            </div>

            <div className="pu-content">
              {view === "landing" && (
                <div className="pu-mockLibraryWrap">
                  <div className="pu-libraryIntro pu-glassLite">
                    <div className="pu-h1">Mock Tests</div>
                    <div className="pu-desc">
                      Create practice exams from any saved study session. Questions are generated from your uploaded documents, saved notes, and full chat history.
                    </div>
                    <div className="pu-libraryPills">
                      <span className="pu-pill">Chat-based generation</span>
                      <span className="pu-pill">Docs + conversation memory</span>
                      <span className="pu-pill">Difficulty-aware mock exams</span>
                    </div>
                  </div>

                  <div className="pu-mockGrid">
                    {filteredChats.map((chat) => (
                      <div key={chat.id} className="pu-mockCard">
                        <div className="pu-mockCardTop">
                          <div>
                            <div className="pu-mockTitle">{chat.title}</div>
                            <div className="pu-mockMeta">
                              {chat.docs} docs • {chat.messages} messages • updated {chat.updated}
                            </div>
                          </div>
                          <div className={`pu-difficulty pu-difficulty-${chat.difficulty.toLowerCase()}`}>
                            {chat.difficulty}
                          </div>
                        </div>

                        <div className="pu-mockDescription">{chat.description}</div>

                        <div className="pu-mockTagsRow">
                          <div className="pu-tagGroup">
                            <span className="pu-subjectBadge">{chat.subject}</span>
                            {chat.tags.map((tag) => (
                              <span key={tag} className="pu-miniTag">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="pu-estimate">~ {chat.estimatedQuestions} questions</div>
                        </div>

                        <div className="pu-mockActions">
                          <button className="pu-btn" type="button">
                            Preview Scope
                          </button>
                          <button className="pu-mockAction" type="button" onClick={() => startMockTest(chat)}>
                            Start Test
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === "testing" && selectedChat && activeQuestion && (
                <div className="pu-testWrap">
                  <div className="pu-testHero pu-glassLite">
                    <div>
                      <div className="pu-testLabel">Live Mock Test</div>
                      <div className="pu-testTitle">{selectedChat.title}</div>
                      <div className="pu-testSub">
                        Built from {selectedChat.docs} saved docs, {selectedChat.messages} messages, and all study context inside this chat.
                      </div>
                    </div>
                    <div className="pu-testStats">
                      <div className="pu-statCard">
                        <div className="pu-statValue">{questions.length}</div>
                        <div className="pu-statLabel">Questions</div>
                      </div>
                      <div className="pu-statCard">
                        <div className="pu-statValue">{selectedChat.difficulty}</div>
                        <div className="pu-statLabel">Difficulty</div>
                      </div>
                        <div className={`pu-statCard ${timeLeft <= 60 ? "pu-statCardWarning" : ""}`}>
                        <div className={`pu-statValue ${timeLeft <= 60 ? "pu-statValueWarning" : ""}`}>
                        {formatTime(timeLeft)}
                        </div>
                        <div className="pu-statLabel">Time Left</div>
                      </div>
                    </div>
                  </div>

                  <div className="pu-progressCard pu-glassLite">
                    <div className="pu-progressTop">
                      <span>
                        Question {currentQuestion + 1} / {questions.length}
                      </span>
                      <span>{Math.round(progressPercent)}% complete</span>
                    </div>
                    <div className="pu-progressTrack">
                      <div className="pu-progressFill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>
                    <div className="pu-questionCard">
                    <div className="pu-questionPrompt">{activeQuestion.prompt}</div>

                    <div className="pu-optionsList">
                      {activeQuestion.options.map((option, optionIndex) => {
                        const selected = selectedAnswers[currentQuestion] === optionIndex;
                        const revealCorrect = showExplanation && optionIndex === activeQuestion.answer;
                        const revealWrong =
                          showExplanation &&
                          selectedAnswers[currentQuestion] === optionIndex &&
                          optionIndex !== activeQuestion.answer;

                        return (
                          <button
                            key={option}
                            type="button"
                            className={[
                              "pu-optionBtn",
                              selected ? "selected" : "",
                              revealCorrect ? "correct" : "",
                              revealWrong ? "wrong" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => handleAnswerSelect(optionIndex)}
                          >
                            <span className="pu-optionLetter">{String.fromCharCode(65 + optionIndex)}</span>
                            <span className="pu-optionText">{option}</span>
                          </button>
                        );
                      })}
                    </div>

                    {showExplanation && (
                      <div className="pu-explanationBox">
                        <div className="pu-explanationTitle">Explanation</div>
                        <div className="pu-explanationText">{activeQuestion.explanation}</div>
                      </div>
                    )}

                    <div className="pu-questionActions">
                      <button
                        className="pu-btn"
                        type="button"
                        onClick={() => setShowExplanation((prev) => !prev)}
                        disabled={selectedAnswers[currentQuestion] === undefined}
                      >
                        {showExplanation ? "Hide Explanation" : "Check Answer"}
                      </button>

                      <button
                        className="pu-mockAction"
                        type="button"
                        onClick={handleNext}
                        disabled={selectedAnswers[currentQuestion] === undefined}
                      >
                        {currentQuestion === questions.length - 1 ? "Submit Test" : "Next Question"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {view === "results" && selectedChat && (
                <div className="pu-resultsWrap">
                  <div className="pu-resultsHero pu-glassLite">
                    <div className="pu-resultsLabel">Completed</div>
                    <div className="pu-resultsTitle">{selectedChat.title}</div>
                    <div className="pu-resultsScore">
                      {score} / {questions.length}
                    </div>
                    <div className="pu-resultsSub">
                      You completed this mock test using content generated from your saved chat, uploaded documents, and prior study discussion.
                    </div>
                  </div>

                  <div className="pu-resultsGrid">
                    <div className="pu-resultsCard">
                      <div className="pu-resultsCardValue">{Math.round((score / questions.length) * 100)}%</div>
                      <div className="pu-resultsCardLabel">Score</div>
                    </div>
                    <div className="pu-resultsCard">
                      <div className="pu-resultsCardValue">{questions.length - score}</div>
                      <div className="pu-resultsCardLabel">Needs Review</div>
                    </div>
                    <div className="pu-resultsCard">
                      <div className="pu-resultsCardValue">{missedQuestions.length}</div>
                      <div className="pu-resultsCardLabel">Weak Topics Found</div>
                    </div>
                  </div>

                  <div className="pu-weakTopicsCard">
                    <div className="pu-weakTopicsEyebrow">Weak Topics Analysis</div>
                    <div className="pu-weakTopicsTitle">Give more questions from these weaker areas</div>
                    <div className="pu-weakTopicsList">
                      {buildWeakTopics().map((item) => (
                        <div key={item.title} className="pu-weakTopicsItem">
                          <div className="pu-weakTopicsItemTitle">{item.title}</div>
                          <div className="pu-weakTopicsItemSummary">{item.summary}</div>
                          <div className="pu-weakTopicsItemAction">{item.action}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pu-reviewList">
                    {questions.map((question, index) => {
                      const isCorrect = selectedAnswers[index] === question.answer;
                      const isOpen = reviewOpen[index];

                      return (
                        <div key={question.id} className="pu-reviewItem">
                          <div className="pu-reviewTop">
                            <div className="pu-reviewQuestion">Question {index + 1}</div>

                            {isCorrect ? (
                              <div className="pu-reviewStatus ok">Correct</div>
                            ) : (
                              <button
                                type="button"
                                className="pu-reviewStatus bad pu-reviewBtn"
                                onClick={() =>
                                  setReviewOpen((prev) => ({
                                    ...prev,
                                    [index]: !prev[index],
                                  }))
                                }
                              >
                                {isOpen ? "Hide Answer" : "Review"}
                              </button>
                            )}
                          </div>

                          <div className="pu-reviewPrompt">{question.prompt}</div>

                          {isOpen && !isCorrect && (
                            <div className="pu-reviewAnswerBlock">
                              <div className="pu-reviewAnswerLabel">Correct Answer</div>
                              <div className="pu-reviewAnswerText">
                                {String.fromCharCode(65 + question.answer)}. {question.options[question.answer]}
                              </div>
                            </div>
                          )}

                          <div className="pu-reviewExplanation">{question.explanation}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pu-resultsActions">
                    <button className="pu-btn" type="button" onClick={handleBackToLibrary}>
                      Back to Chats
                    </button>
                    <button className="pu-mockAction" type="button" onClick={restartTest}>
                      Retake Test
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <style jsx>{`
        :global(:root) {
          --pu-bg: #07070b;
          --pu-text: rgba(255, 255, 255, 0.92);
          --pu-muted: rgba(255, 255, 255, 0.62);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-accent-3: #7c8cff;
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, "Apple Color Emoji", "Segoe UI Emoji";
          --pu-radius-lg: 22px;
          --pu-radius-md: 18px;
          --pu-radius-sm: 14px;
          --pu-border: rgba(255, 255, 255, 0.1);
          --pu-border-2: rgba(255, 255, 255, 0.14);
          --pu-surface: rgba(255, 255, 255, 0.03);
          --pu-surface-2: rgba(255, 255, 255, 0.045);
          --pu-shadow: 0 18px 60px rgba(0, 0, 0, 0.46);
          --pu-shadow-soft: 0 10px 26px rgba(0, 0, 0, 0.28);
        }

        .pu-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: var(--pu-bg);
        }

        .pu-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(80% 70% at 50% 35%, rgba(90, 168, 255, 0), rgba(0, 0, 0, 0.55));
        }

        .pu-root {
          position: relative;
          height: 100vh;
          padding: 14px;
          overflow: hidden;
          color: var(--pu-text);
          font-family: var(--pu-font-sans);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        .pu-root::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.1;
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 5px 5px;
          mix-blend-mode: overlay;
        }

        .pu-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 14px;
          min-width: 0;
        }

        .pu-glass {
          position: relative;
          border-radius: var(--pu-radius-lg);
          border: 1px solid var(--pu-border);
          background: rgba(10, 12, 18, 0.36);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          box-shadow: var(--pu-shadow);
          overflow: hidden;
          will-change: backdrop-filter;
        }

        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .pu-glass {
            background: rgba(10, 12, 18, 0.62);
          }
        }

        .pu-glass::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: radial-gradient(60% 40% at 28% 10%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 60%),
            radial-gradient(50% 36% at 86% 12%, rgba(95, 227, 255, 0.1), rgba(0, 0, 0, 0) 62%);
          opacity: 0.22;
        }

        .pu-glass::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 34%);
          opacity: 0.35;
        }

        .pu-glass > * {
          position: relative;
          z-index: 2;
        }

        .pu-glassLite {
          position: relative;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.32);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
          overflow: hidden;
        }

        .pu-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }

        .pu-btn:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(95, 227, 255, 0.22);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-btn:disabled,
        .pu-mockAction:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        .pu-btnPrimary {
          border-color: rgba(95, 227, 255, 0.16);
          background: linear-gradient(90deg, rgba(90, 168, 255, 0.95), rgba(95, 227, 255, 0.95));
          color: rgba(0, 0, 0, 0.92);
        }

        .pu-sidebar {
          padding: 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .pu-brandRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pu-brand {
          font-weight: 950;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: 14px;
        }

        .pu-sectionLabel {
          margin-top: 14px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.48);
        }

        .pu-sideNav {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pu-sideItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 12px;
          border-radius: var(--pu-radius-md);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.26);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          backdrop-filter: blur(12px) saturate(140%);
          cursor: pointer;
          user-select: none;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          position: relative;
          overflow: hidden;
        }

        .pu-sideItem:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.045);
          border-color: rgba(95, 227, 255, 0.2);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-sideItem.active {
          border-color: rgba(95, 227, 255, 0.26);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
        }

        .pu-sideItem.active::before {
          content: "";
          position: absolute;
          left: 10px;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, var(--pu-accent-2), var(--pu-accent-1));
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 24px rgba(95, 227, 255, 0.22);
        }

        .pu-sideIcon {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.72);
          flex-shrink: 0;
        }

        .pu-sideLabel {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-search {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-search input {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          color: var(--pu-text);
          font-size: 12px;
        }

        .pu-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: auto;
          min-height: 0;
          padding-right: 6px;
          scrollbar-gutter: stable;
        }

          .pu-itemCompact {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
          text-align: left;
          cursor: pointer;
        }

        .pu-itemCompact:hover {
          background: rgba(255, 255, 255, 0.045);
          border-color: rgba(255, 255, 255, 0.14);
          transform: translateY(-1px);
        }

        .pu-itemTitle {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-itemSub {
          margin-top: 4px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .pu-topbar {
          padding: 14px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-wrap: wrap;
        }

        .pu-pageEyebrow {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.52);
          font-weight: 900;
        }

        .pu-pageTitle {
          margin-top: 4px;
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
        }

        .pu-topbarActions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pu-content {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 18px;
          position: relative;
        }

        .pu-mockLibraryWrap,
        .pu-testWrap,
        .pu-resultsWrap {
          width: min(980px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .pu-libraryIntro,
        .pu-testHero,
        .pu-progressCard,
        .pu-resultsHero {
          padding: 18px;
        }

        .pu-h1 {
          font-size: 16px;
          font-weight: 950;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.92);
        }

        .pu-desc {
          margin-top: 8px;
          font-size: 13px;
          color: var(--pu-muted);
          line-height: 1.6;
          max-width: 72ch;
        }

        .pu-libraryPills {
          margin-top: 14px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .pu-pill,
        .pu-miniTag,
        .pu-subjectBadge,
        .pu-difficulty {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .pu-pill,
        .pu-miniTag,
        .pu-subjectBadge {
          padding: 8px 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.84);
        }

        .pu-mockGrid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .pu-mockCard {
          padding: 18px;
          border-radius: var(--pu-radius-md);
          border: 1px solid var(--pu-border);
          background: rgba(10, 12, 18, 0.32);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .pu-mockCard:hover {
          transform: translateY(-2px);
          border-color: rgba(95, 227, 255, 0.22);
          background: rgba(255, 255, 255, 0.045);
        }

        .pu-mockCardTop,
        .pu-mockTagsRow,
        .pu-mockActions,
        .pu-progressTop,
        .pu-reviewTop,
        .pu-resultsActions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pu-mockTitle,
        .pu-testTitle,
        .pu-resultsTitle {
          font-size: 16px;
          font-weight: 950;
          color: var(--pu-text);
          letter-spacing: -0.02em;
        }

        .pu-mockMeta,
        .pu-mockDescription,
        .pu-testSub,
        .pu-resultsSub,
        .pu-explanationText,
        .pu-reviewExplanation {
          font-size: 12px;
          line-height: 1.65;
          color: var(--pu-muted);
        }

        .pu-mockDescription {
          margin-top: -2px;
        }

        .pu-tagGroup {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pu-estimate {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.76);
        }

        .pu-difficulty {
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .pu-difficulty-easy {
          background: rgba(95, 227, 255, 0.08);
          color: rgba(95, 227, 255, 0.9);
        }

        .pu-difficulty-medium {
          background: rgba(124, 140, 255, 0.1);
          color: rgba(152, 165, 255, 0.95);
        }

        .pu-difficulty-hard {
          background: rgba(90, 168, 255, 0.12);
          color: rgba(132, 197, 255, 0.95);
        }

        .pu-mockAction {
          height: 36px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(95, 227, 255, 0.22);
          background: linear-gradient(90deg, rgba(90, 168, 255, 0.95), rgba(95, 227, 255, 0.95));
          color: rgba(0, 0, 0, 0.92);
          font-weight: 900;
          font-size: 12px;
          cursor: pointer;
          transition: transform 120ms ease;
        }

        .pu-mockAction:hover {
          transform: translateY(-1px);
        }

        .pu-testLabel,
        .pu-resultsLabel,
        .pu-explanationTitle {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.52);
        }

        .pu-testStats,
        .pu-resultsGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .pu-statCard,
        .pu-resultsCard {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          min-width: 0;
        }
        .pu-statCardWarning {
          border-color: rgba(124, 140, 255, 0.22);
          background: rgba(124, 140, 255, 0.08);
        }

        .pu-statValueWarning {
          color: rgba(160, 170, 255, 0.98);
        }


        .pu-statValue,
        .pu-resultsCardValue,
        .pu-resultsScore {
          font-size: 24px;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
        }

        .pu-statLabel,
        .pu-resultsCardLabel {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.58);
        }

        .pu-progressTop {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.8);
        }

        .pu-progressTrack {
          margin-top: 12px;
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .pu-progressFill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          box-shadow: 0 0 20px rgba(95, 227, 255, 0.22);
        }

        .pu-questionCard {
          padding: 22px;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.32);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .pu-questionPrompt,
        .pu-reviewPrompt {
          font-size: 18px;
          font-weight: 900;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.93);
          letter-spacing: -0.02em;
        }

        .pu-optionsList,
        .pu-reviewList {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pu-optionBtn {
          width: 100%;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }

        .pu-optionBtn:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(95, 227, 255, 0.2);
        }

        .pu-optionBtn.selected {
          border-color: rgba(95, 227, 255, 0.24);
          background: rgba(95, 227, 255, 0.08);
        }

        .pu-optionBtn.correct {
          border-color: rgba(95, 227, 255, 0.34);
          background: rgba(95, 227, 255, 0.12);
        }

        .pu-optionBtn.wrong {
          border-color: rgba(124, 140, 255, 0.24);
          background: rgba(124, 140, 255, 0.1);
        }

        .pu-optionLetter {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          font-size: 12px;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-optionText {
          font-size: 13px;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-explanationBox,
        .pu-reviewItem {
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-questionActions {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pu-reviewQuestion {
          font-size: 12px;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-reviewStatus {
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .pu-reviewStatus.ok {
          background: rgba(95, 227, 255, 0.1);
          color: rgba(95, 227, 255, 0.92);
        }

        .pu-reviewStatus.bad {
          background: rgba(124, 140, 255, 0.1);
          color: rgba(160, 170, 255, 0.95);
        }
                .pu-reviewBtn {
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-reviewBtn:hover {
          transform: translateY(-1px);
          border-color: rgba(124, 140, 255, 0.24);
          background: rgba(124, 140, 255, 0.16);
        }

        .pu-reviewAnswerBlock {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(95, 227, 255, 0.16);
          background: rgba(95, 227, 255, 0.06);
        }

        .pu-reviewAnswerLabel {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(95, 227, 255, 0.9);
        }

        .pu-reviewAnswerText {
          margin-top: 6px;
          font-size: 13px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.5;
      }

        .pu-weakTopicsCard {
          padding: 18px;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(95, 227, 255, 0.14);
          background: rgba(10, 12, 18, 0.32);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-weakTopicsEyebrow {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 900;
          color: rgba(95, 227, 255, 0.88);
        }

        .pu-weakTopicsTitle {
          margin-top: 8px;
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.94);
        }

        .pu-weakTopicsList {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pu-weakTopicsItem {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-weakTopicsItemTitle {
          font-size: 13px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
        }

        .pu-weakTopicsItemSummary {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.78);
        }

        .pu-weakTopicsItemAction {
          margin-top: 8px;
          font-size: 12px;
          line-height: 1.6;
          color: rgba(95, 227, 255, 0.9);
        }

        .pu-resultsScore {
          margin-top: 14px;
        }

        @media (max-width: 980px) {
          .pu-shell {
            grid-template-columns: 1fr;
          }

          .pu-sidebar {
            display: none;
          }
        }

        @media (max-width: 720px) {
          .pu-content {
            padding: 14px;
          }

          .pu-testStats,
          .pu-resultsGrid {
            grid-template-columns: 1fr;
          }

          .pu-questionPrompt,
          .pu-reviewPrompt {
            font-size: 16px;
          }

          .pu-questionCard {
            padding: 16px;
          }
        }
      `}</style>
    </>
  );
}