const fitur = [
  {
    judul: "Cepat di HP",
    isi: "Halaman ringan, satu soal per layar, dan hemat kuota.",
  },
  {
    judul: "Adil",
    isi: "Skor dan timer dihitung sepenuhnya di server, tidak bisa dimanipulasi dari browser.",
  },
  {
    judul: "Mudah dibuat",
    isi: "Editor sederhana untuk guru dan kreator komunitas, terbit dalam hitungan menit.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Fase 0 · Fondasi aktif
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">KuisKita</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Platform kuis berbahasa Indonesia tempat siapa pun dapat mengerjakan kuis,
          membuat kuis, dan bersaing di papan peringkat.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {fitur.map((item) => (
          <li
            key={item.judul}
            className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
          >
            <h2 className="text-base font-semibold">{item.judul}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.isi}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-500 dark:text-slate-500">
        Endpoint kesehatan: <code className="font-mono">/api/health</code>
      </p>
    </main>
  );
}
