export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <header className="max-w-6xl mx-auto mb-8">
        <div className="h-10 w-64 bg-zinc-800 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-zinc-800 rounded animate-pulse" />
      </header>

      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse h-28" />
        ))}
      </section>

      <section className="max-w-6xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 animate-pulse">
        <div className="h-4 w-24 bg-zinc-800 rounded mb-4" />
        <div className="h-4 w-1/2 bg-zinc-800 rounded mb-3" />
        <div className="h-4 w-3/4 bg-zinc-800 rounded mb-3" />
        <div className="h-4 w-2/3 bg-zinc-800 rounded" />
      </section>

      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse h-64" />
        ))}
      </section>
    </main>
  );
}
