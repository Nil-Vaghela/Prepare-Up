import Image from "next/image";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Prepare-Up</h1>
        <p className="text-gray-600">
          Turn your notes into study guides, flashcards, and podcasts.
        </p>

        <button className="px-6 py-3 bg-black text-white rounded-lg">
          Get Started
        </button>
      </div>
    </main>
  );
}