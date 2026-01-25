export default async function HelloPage() {
  const res = await fetch("http://backend:8000/api/hello", { cache: "no-store" });

  if (!res.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Hello</h1>
        <p>Backend call failed: {res.status}</p>
      </main>
    );
  }

  const data = (await res.json()) as { message: string; utc_time: string };

  return (
    <main style={{ padding: 24 }}>
      <h1>Next.js → FastAPI (Docker)</h1>
      <p><strong>Message:</strong> {data.message}</p>
      <p><strong>UTC Time:</strong> {data.utc_time}</p>
    </main>
  );
}