"use client";

import { useMemo, useState } from "react";

type SavedChat = {
  id: string;
  title: string;
  updated: string;
  docs: number;
  messages: number;
  difficulty: "Easy" | "Medium" | "Hard";
  estimatedCards: number;
  subject: string;
  description: string;
  tags: string[];
};

type Flashcard = {
  id: number;
  front: string;
  back: string;
};

type ViewState = "landing" | "studying";

const savedChats: SavedChat[] = [
  {
    id: "chat-1",
    title: "ECON Final Study",
    updated: "2 hours ago",
    docs: 3,
    messages: 42,
    difficulty: "Medium",
    estimatedCards: 16,
    subject: "Economics",
    description: "Includes inflation, fiscal policy, aggregate demand, and recession-focused review.",
    tags: ["Final", "Macro", "Graphs"],
  },
  {
    id: "chat-2",
    title: "AI Midterm Notes",
    updated: "Yesterday",
    docs: 2,
    messages: 28,
    difficulty: "Hard",
    estimatedCards: 14,
    subject: "Artificial Intelligence",
    description: "Built from search algorithms, heuristics, state spaces, and past quiz explanations.",
    tags: ["A*", "Search", "Heuristics"],
  },
  {
    id: "chat-3",
    title: "Algorithms Exam Prep",
    updated: "Today",
    docs: 4,
    messages: 51,
    difficulty: "Hard",
    estimatedCards: 20,
    subject: "Algorithms",
    description: "Covers DP, greedy algorithms, heaps, sorting, and divide-and-conquer methods.",
    tags: ["DP", "Greedy", "Trees"],
  },
  {
    id: "chat-4",
    title: "Database Systems Review",
    updated: "3 days ago",
    docs: 1,
    messages: 19,
    difficulty: "Easy",
    estimatedCards: 12,
    subject: "Databases",
    description: "SQL, normalization, indexing, joins, and schema design.",
    tags: ["SQL", "ERD", "Indexing"],
  },
  {
    id: "chat-5",
    title: "Statistics Refresher",
    updated: "Last week",
    docs: 2,
    messages: 33,
    difficulty: "Medium",
    estimatedCards: 15,
    subject: "Statistics",
    description: "Probability, p-values, confidence intervals, distributions, and inference.",
    tags: ["Probability", "Tests", "Inference"],
  },
];

const flashcardsByChat: Record<string, Flashcard[]> = {
  "chat-1": [
    {
      id: 1,
      front: "What is cost-push inflation?",
      back: "Inflation caused by higher production costs that reduce aggregate supply and raise prices.",
    },
    {
      id: 2,
      front: "What tools does fiscal policy use during a recession?",
      back: "Government spending and taxation to stabilize demand and output.",
    },
    {
      id: 3,
      front: "What usually happens to investment when interest rates rise?",
      back: "Investment spending tends to fall because borrowing becomes more expensive.",
    },
    {
      id: 4,
      front: "What is aggregate demand?",
      back: "The total demand for goods and services in an economy at a given overall price level.",
    },
    {
      id: 5,
      front: "What does expansionary fiscal policy aim to do?",
      back: "Increase overall demand and support output during economic slowdown.",
    },
  ],
  "chat-2": [
    {
      id: 1,
      front: "What does A* search minimize?",
      back: "The estimated total cost f(n) = g(n) + h(n).",
    },
    {
      id: 2,
      front: "What is a heuristic?",
      back: "A rule-of-thumb estimate used to guide search toward a goal efficiently.",
    },
    {
      id: 3,
      front: "What makes a heuristic admissible?",
      back: "It never overestimates the true cost to the goal.",
    },
    {
      id: 4,
      front: "How does BFS differ from DFS?",
      back: "BFS explores level by level, while DFS explores one path deeply before backtracking.",
    },
    {
      id: 5,
      front: "Why is A* often preferred over uninformed search?",
      back: "Because it uses both path cost and heuristic guidance to explore promising paths first.",
    },
  ],
  "chat-3": [
    {
      id: 1,
      front: "What is dynamic programming best known for?",
      back: "Solving overlapping subproblems once and storing the results.",
    },
    {
      id: 2,
      front: "What is heapsort’s worst-case time complexity?",
      back: "O(n log n).",
    },
    {
      id: 3,
      front: "Which algorithm is a classic greedy algorithm?",
      back: "Dijkstra’s algorithm, when edge weights are nonnegative.",
    },
    {
      id: 4,
      front: "What is divide and conquer?",
      back: "A strategy that breaks a problem into smaller subproblems, solves them recursively, and combines results.",
    },
    {
      id: 5,
      front: "What is the key idea behind memoization?",
      back: "Store previously computed results to avoid repeated work.",
    },
  ],
  "chat-4": [
    {
      id: 1,
      front: "What does 3NF primarily reduce?",
      back: "Transitive dependency problems.",
    },
    {
      id: 2,
      front: "Which SQL clause filters grouped results?",
      back: "HAVING.",
    },
    {
      id: 3,
      front: "What is the main purpose of an index?",
      back: "To speed up data retrieval for queries.",
    },
    {
      id: 4,
      front: "What is normalization?",
      back: "Organizing data to reduce redundancy and improve consistency.",
    },
    {
      id: 5,
      front: "What does a JOIN do in SQL?",
      back: "It combines rows from two or more tables based on a related column.",
    },
  ],
  "chat-5": [
    {
      id: 1,
      front: "What does a p-value represent?",
      back: "The probability of observing data at least as extreme under the null hypothesis.",
    },
    {
      id: 2,
      front: "Which distribution is used for small-sample mean tests when sigma is unknown?",
      back: "The t-distribution.",
    },
    {
      id: 3,
      front: "What does a confidence interval provide?",
      back: "A plausible range of values for a population parameter.",
    },
    {
      id: 4,
      front: "What is the null hypothesis?",
      back: "A default claim that there is no effect, difference, or relationship.",
    },
    {
      id: 5,
      front: "Why are larger samples useful in statistics?",
      back: "They generally improve estimate stability and reduce sampling variability.",
    },
  ],
};

function shuffleArray<T>(input: T[]) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function FlashcardPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewState>("landing");
  const [selectedChat, setSelectedChat] = useState<SavedChat | null>(null);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [flipped, setFlipped] = useState(false);

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

  const activeCard = deck[currentCard];
  const progressPercent = deck.length ? ((currentCard + 1) / deck.length) * 100 : 0;

  const startDeck = (chat: SavedChat) => {
    setSelectedChat(chat);
    setDeck(flashcardsByChat[chat.id] ?? []);
    setCurrentCard(0);
    setFlipped(false);
    setView("studying");
  };

  const handleBackToLibrary = () => {
    setView("landing");
    setSelectedChat(null);
    setDeck([]);
    setCurrentCard(0);
    setFlipped(false);
  };

  const goNext = () => {
    if (currentCard < deck.length - 1) {
      setCurrentCard((prev) => prev + 1);
      setFlipped(false);
    }
  };

  const goPrev = () => {
    if (currentCard > 0) {
      setCurrentCard((prev) => prev - 1);
      setFlipped(false);
    }
  };

  const restartDeck = () => {
    setCurrentCard(0);
    setFlipped(false);
  };

  const shuffleDeck = () => {
    setDeck((prev) => shuffleArray(prev));
    setCurrentCard(0);
    setFlipped(false);
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
              <button className="pu-sideItem active" type="button">
                <span className="pu-sideIcon">▣</span>
                <span className="pu-sideLabel">Flash Cards</span>
              </button>

              <button className="pu-sideItem" type="button">
                <span className="pu-sideIcon">◉</span>
                <span className="pu-sideLabel">Podcast</span>
              </button>

              <button className="pu-sideItem" type="button">
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
                  onClick={() => startDeck(chat)}
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
                <div className="pu-pageEyebrow">Flashcard Workspace</div>
                <div className="pu-pageTitle">
                  {view === "landing" && "Generate from saved chats"}
                  {view === "studying" && `Studying: ${selectedChat?.title ?? "Flashcards"}`}
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
                    <div className="pu-h1">Flash Cards</div>
                    <div className="pu-desc">
                      Generate a flashcard deck from any saved study session. This mock version shows how the
                      experience will work once connected to your real chats and backend sessions.
                    </div>
                    <div className="pu-libraryPills">
                      <span className="pu-pill">Chat-based generation</span>
                      <span className="pu-pill">Docs + conversation memory</span>
                      <span className="pu-pill">Fast active recall practice</span>
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
                          <div className="pu-estimate">~ {chat.estimatedCards} cards</div>
                        </div>

                        <div className="pu-mockActions">
                          <button className="pu-btn" type="button">
                            Preview Scope
                          </button>
                          <button className="pu-mockAction" type="button" onClick={() => startDeck(chat)}>
                            Start Deck
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === "studying" && selectedChat && activeCard && (
                <div className="pu-testWrap">
                  <div className="pu-testHero pu-glassLite">
                    <div>
                      <div className="pu-testLabel">Live Flashcard Deck</div>
                      <div className="pu-testTitle">{selectedChat.title}</div>
                      <div className="pu-testSub">
                        Built from {selectedChat.docs} saved docs, {selectedChat.messages} messages, and all study
                        context inside this chat.
                      </div>
                    </div>

                    <div className="pu-testStats">
                      <div className="pu-statCard">
                        <div className="pu-statValue">{deck.length}</div>
                        <div className="pu-statLabel">Cards</div>
                      </div>
                      <div className="pu-statCard">
                        <div className="pu-statValue">{selectedChat.difficulty}</div>
                        <div className="pu-statLabel">Difficulty</div>
                      </div>
                      <div className="pu-statCard">
                        <div className="pu-statValue">{currentCard + 1}</div>
                        <div className="pu-statLabel">Current Card</div>
                      </div>
                    </div>
                  </div>

                  <div className="pu-progressCard pu-glassLite">
                    <div className="pu-progressTop">
                      <span>
                        Card {currentCard + 1} / {deck.length}
                      </span>
                      <span>{Math.round(progressPercent)}% complete</span>
                    </div>
                    <div className="pu-progressTrack">
                      <div className="pu-progressFill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`pu-flipCard ${flipped ? "flipped" : ""}`}
                    onClick={() => setFlipped((prev) => !prev)}
                  >
                    <div className="pu-flipCardInner">
                      <div className="pu-flipFace pu-flipFront">
                        <div className="pu-flipBadge">Front</div>
                        <div className="pu-flipText">{activeCard.front}</div>
                        <div className="pu-flipHint">Tap to reveal answer</div>
                      </div>

                      <div className="pu-flipFace pu-flipBack">
                        <div className="pu-flipBadge">Back</div>
                        <div className="pu-flipText">{activeCard.back}</div>
                        <div className="pu-flipHint">Tap to flip back</div>
                      </div>
                    </div>
                  </button>

                  <div className="pu-studyActions">
                    <button className="pu-btn" type="button" onClick={goPrev} disabled={currentCard === 0}>
                      Previous
                    </button>

                    <button className="pu-btn" type="button" onClick={() => setFlipped((prev) => !prev)}>
                      {flipped ? "Show Front" : "Show Answer"}
                    </button>

                    <button className="pu-btn" type="button" onClick={restartDeck}>
                      Restart
                    </button>

                    <button className="pu-btn" type="button" onClick={shuffleDeck}>
                      Shuffle
                    </button>

                    <button
                      className="pu-mockAction"
                      type="button"
                      onClick={goNext}
                      disabled={currentCard === deck.length - 1}
                    >
                      Next
                    </button>
                  </div>

                  <div className="pu-weakTopicsCard">
                    <div className="pu-weakTopicsEyebrow">Deck Tips</div>
                    <div className="pu-weakTopicsTitle">Use these cards for active recall</div>
                    <div className="pu-weakTopicsList">
                      <div className="pu-weakTopicsItem">
                        <div className="pu-weakTopicsItemTitle">Say the answer first</div>
                        <div className="pu-weakTopicsItemSummary">
                          Try to answer before flipping the card so you actively retrieve the concept.
                        </div>
                      </div>

                      <div className="pu-weakTopicsItem">
                        <div className="pu-weakTopicsItemTitle">Shuffle after one full pass</div>
                        <div className="pu-weakTopicsItemSummary">
                          This helps stop memorizing the order and strengthens real recall.
                        </div>
                      </div>

                      <div className="pu-weakTopicsItem">
                        <div className="pu-weakTopicsItemTitle">Repeat missed concepts</div>
                        <div className="pu-weakTopicsItemSummary">
                          Restart the deck and pay extra attention to the cards you couldn’t answer quickly.
                        </div>
                      </div>
                    </div>
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
        .pu-testWrap {
          width: min(980px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .pu-libraryIntro,
        .pu-testHero,
        .pu-progressCard {
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
        .pu-studyActions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pu-mockTitle,
        .pu-testTitle {
          font-size: 16px;
          font-weight: 950;
          color: var(--pu-text);
          letter-spacing: -0.02em;
        }

        .pu-mockMeta,
        .pu-mockDescription,
        .pu-testSub {
          font-size: 12px;
          line-height: 1.65;
          color: var(--pu-muted);
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

        .pu-testLabel {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.52);
        }

        .pu-testStats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .pu-statCard {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          min-width: 0;
        }

        .pu-statValue {
          font-size: 24px;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
        }

        .pu-statLabel {
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

        .pu-flipCard {
          width: 100%;
          min-height: 430px;
          perspective: 1400px;
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }

        .pu-flipCardInner {
          position: relative;
          width: 100%;
          min-height: 430px;
          transform-style: preserve-3d;
          transition: transform 0.6s ease;
        }

        .pu-flipCard.flipped .pu-flipCardInner {
          transform: rotateY(180deg);
        }

        .pu-flipFace {
          position: absolute;
          inset: 0;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 12, 18, 0.34);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
          padding: 28px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          backface-visibility: hidden;
          overflow: hidden;
        }

        .pu-flipFace::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(60% 40% at 20% 10%, rgba(255,255,255,0.10), transparent 60%),
            radial-gradient(50% 36% at 85% 12%, rgba(95,227,255,0.10), transparent 62%);
          opacity: 0.28;
        }

        .pu-flipBack {
          transform: rotateY(180deg);
        }

        .pu-flipBadge,
        .pu-flipText,
        .pu-flipHint {
          position: relative;
          z-index: 1;
        }

        .pu-flipBadge {
          display: inline-flex;
          width: fit-content;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(95, 227, 255, 0.2);
          background: rgba(255, 255, 255, 0.04);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.72);
        }

        .pu-flipText {
          font-size: clamp(24px, 3vw, 40px);
          line-height: 1.3;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
          text-align: left;
        }

        .pu-flipHint {
          font-size: 12px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.58);
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

          .pu-testStats {
            grid-template-columns: 1fr;
          }

          .pu-flipFace {
            padding: 18px;
          }

          .pu-flipText {
            font-size: 22px;
          }

          .pu-flipCard,
          .pu-flipCardInner {
            min-height: 360px;
          }
        }
      `}</style>
    </>
  );
}