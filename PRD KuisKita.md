# PRD KuisKita

*Product Requirements Document · Versi 1.0 · 6 November 2026 · Status: Draf untuk ditinjau*

## 1. Ringkasan Eksekutif

KuisKita adalah platform kuis online berbahasa Indonesia tempat siapa pun dapat mengerjakan kuis, membuat kuis, dan bersaing di papan peringkat. Fokus produk: **cepat di HP, adil (sulit dicurangi), dan mudah dipakai guru maupun kreator komunitas**.

Nilai utama:

- **Pemain:** kuis beragam, hasil instan dengan pembahasan, riwayat dan peringkat.
- **Kreator/guru:** editor kuis sederhana, penilaian otomatis, statistik per soal.
- **Pengelola:** moderasi konten, keamanan kuat, biaya infrastruktur rendah pada tahap awal.

Stack yang diusulkan: Next.js (TypeScript) + Supabase (PostgreSQL, Auth, Storage) + Vercel, dengan Upstash Redis untuk rate limit dan cache.

## 2. Latar Belakang dan Masalah

| Masalah | Dampak |
| --- | --- |
| Kuis dibuat dengan formulir umum tanpa penilaian otomatis, timer, atau peringkat | Guru dan kreator menilai manual, pengalaman pemain hambar |
| Platform kuis populer berbahasa Inggris dan fitur utamanya berbayar | Konten lokal kurang, akses terbatas |
| Kuis yang dinilai di sisi browser mudah dicurangi | Hasil tidak adil, peringkat tidak bermakna |
| Banyak pengguna memakai HP dengan kuota terbatas | Halaman berat membuat pengguna pergi |

## 3. Visi, Tujuan, dan Metrik Keberhasilan

**Visi:** menjadikan belajar dan bermain kuis dalam bahasa Indonesia semudah membuka tautan.

**Tujuan MVP:**

1. Pemain dapat menyelesaikan kuis dari buka halaman sampai melihat hasil dalam kurang dari 3 klik.
2. Kreator dapat membuat dan menerbitkan kuis 10 soal dalam kurang dari 10 menit.
3. Penilaian 100% dilakukan di server dan kunci jawaban tidak pernah terkirim ke klien selama kuis berlangsung.
4. Seluruh data pengguna terlindungi RLS dan terbukti lewat tes otomatis.
5. Biaya bulanan MVP tetap di tier gratis atau sangat murah.

**Metrik (target 3 bulan setelah peluncuran, perlu divalidasi):**

| Metrik | Target |
| --- | --- |
| Pengguna terdaftar | 1.000 |
| Kuis terbit | 150 |
| Completion rate (mulai → submit) | ≥ 70% |
| Retensi hari ke-7 | ≥ 20% |
| Latensi p95 endpoint submit | < 800 ms |
| Error rate API | < 1% |
| Uptime | ≥ 99,5% |
| Skor Lighthouse mobile (performa) | ≥ 85 |

## 4. Non-Tujuan (di luar MVP)

- Pembayaran dan langganan.
- Kuis live multiplayer ala Kahoot (masuk rilis berikutnya).
- Aplikasi native iOS/Android (MVP berupa web responsif/PWA).
- Generator soal berbasis AI.
- Proctoring kamera/layar.
- Multi-bahasa antarmuka (MVP hanya Bahasa Indonesia).

## 5. Persona Pengguna

| Persona | Profil | Kebutuhan utama |
| --- | --- | --- |
| **Rani**, pelajar SMA | Memakai HP, kuota terbatas, suka kompetisi | Kuis cepat dimuat, skor langsung, peringkat teman |
| **Pak Budi**, guru | Membuat latihan untuk kelas, tidak teknis | Editor mudah, tautan untuk dibagikan, rekap nilai |
| **Dina**, kreator komunitas | Membuat kuis hiburan/trivia untuk pengikut | Kuis menarik, statistik, kontrol visibilitas |
| **Admin KuisKita** | Mengelola platform | Moderasi cepat, laporan, pemantauan kesehatan sistem |

## 6. Ruang Lingkup dan Prioritas

| Rilis | Prioritas | Isi |
| --- | --- | --- |
| **MVP (v1.0)** | P0 | Auth, katalog, pengerjaan kuis, penilaian server, hasil + pembahasan, editor kuis, riwayat, leaderboard dasar, moderasi dasar |
| **v1.1** | P1 | Kuis privat dengan kode/tautan, kelas/grup, impor soal CSV, ekspor hasil, notifikasi email, laporan soal |
| **v1.2** | P2 | Kuis live (room code, skor realtime), sertifikat, badge dan streak, bank soal bersama |
| **Selanjutnya** | P3 | PWA offline, multi-bahasa, integrasi LMS, rekomendasi kuis |

## 7. Peran dan Izin

| Aksi | Tamu | Player | Creator | Admin |
| --- | --- | --- | --- | --- |
| Lihat katalog dan detail kuis publik | ✓ | ✓ | ✓ | ✓ |
| Mengerjakan kuis publik | ✓ (tanpa peringkat) | ✓ | ✓ | ✓ |
| Simpan riwayat dan masuk leaderboard | ✗ | ✓ | ✓ | ✓ |
| Membuat dan mengelola kuis sendiri | ✗ | ✗ | ✓ | ✓ |
| Melihat statistik kuis miliknya | ✗ | ✗ | ✓ | ✓ |
| Moderasi kuis dan pengguna | ✗ | ✗ | ✗ | ✓ |

Pengguna baru berperan **player**. Peningkatan ke **creator** dilakukan setelah email terverifikasi (otomatis) atau lewat persetujuan admin (opsional, dapat diatur).

## 8. Kebutuhan Fungsional

### 8.1 Autentikasi dan Akun (FR-A)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-A1 | Daftar dan masuk dengan email + password | P0 |
| FR-A2 | Masuk dengan Google | P0 |
| FR-A3 | Verifikasi email dan reset password | P0 |
| FR-A4 | Magic link | P1 |
| FR-A5 | Edit profil (username unik, avatar) | P0 |
| FR-A6 | Hapus akun beserta data pribadi | P1 |

### 8.2 Katalog dan Pencarian (FR-K)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-K1 | Daftar kuis terbit dengan paginasi | P0 |
| FR-K2 | Filter kategori, tingkat kesulitan, durasi | P0 |
| FR-K3 | Pencarian judul dan deskripsi | P0 |
| FR-K4 | Urutan: terbaru, terpopuler | P0 |
| FR-K5 | Halaman detail: deskripsi, jumlah soal, durasi, kreator, skor tertinggi | P0 |

### 8.3 Pengerjaan Kuis (FR-P)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-P1 | Mulai percobaan; server mencatat waktu mulai | P0 |
| FR-P2 | Tipe soal: pilihan ganda tunggal, benar/salah; (v1.1: pilihan ganda majemuk, isian singkat) | P0 |
| FR-P3 | Timer berbasis waktu server; sisa waktu tersinkron saat halaman dimuat ulang | P0 |
| FR-P4 | Autosave jawaban; pemain dapat melanjutkan percobaan yang belum selesai | P0 |
| FR-P5 | Navigasi antarsoal dan penanda soal belum dijawab | P0 |
| FR-P6 | Urutan soal dan opsi dapat diacak per percobaan (opsi kreator) | P0 |
| FR-P7 | Submit manual atau otomatis saat waktu habis | P0 |
| FR-P8 | Batas jumlah percobaan per kuis (opsi kreator) | P1 |

### 8.4 Penilaian dan Hasil (FR-H)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-H1 | Penilaian di server menggunakan kunci jawaban yang tidak pernah dikirim ke klien | P0 |
| FR-H2 | Skor berbobot per soal; persentase dan jumlah benar/salah | P0 |
| FR-H3 | Halaman hasil dengan jawaban pemain, jawaban benar, dan pembahasan (setelah submit) | P0 |
| FR-H4 | Tombol bagikan hasil dan coba lagi | P1 |

### 8.5 Editor Kuis (FR-E)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-E1 | Buat, ubah, hapus kuis; status draft/terbit | P0 |
| FR-E2 | Tambah, ubah, urutkan, hapus soal dan opsi | P0 |
| FR-E3 | Unggah gambar soal (maks 2 MB; jpg/png/webp) | P0 |
| FR-E4 | Pratinjau kuis sebelum terbit | P0 |
| FR-E5 | Validasi sebelum terbit: minimal 1 soal, tiap soal punya jawaban benar | P0 |
| FR-E6 | Duplikasi kuis | P1 |
| FR-E7 | Impor soal dari CSV | P1 |
| FR-E8 | Statistik: jumlah percobaan, rata-rata skor, soal tersulit | P1 |

### 8.6 Leaderboard dan Riwayat (FR-L, FR-R)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-L1 | Leaderboard per kuis (skor lalu waktu tercepat) | P0 |
| FR-L2 | Leaderboard global mingguan | P1 |
| FR-R1 | Riwayat percobaan dan skor pengguna | P0 |
| FR-R2 | Lihat ulang hasil dan pembahasan percobaan lama | P0 |

### 8.7 Admin dan Moderasi (FR-M)

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-M1 | Daftar kuis dan pengguna; tangguhkan atau turunkan kuis | P0 |
| FR-M2 | Terima dan tinjau laporan konten | P1 |
| FR-M3 | Catatan audit tindakan admin | P1 |
| FR-M4 | Dasbor ringkas: pengguna aktif, kuis baru, percobaan harian | P1 |

## 9. User Story dan Kriteria Penerimaan

**US-1. Sebagai player, saya ingin mengerjakan kuis dengan timer yang adil.**

- Given saya menekan Mulai, when server membuat percobaan, then waktu mulai tersimpan di server.
- Given saya menutup tab lalu membuka lagi, when percobaan masih aktif, then sisa waktu dan jawaban tersimpan tampil benar.
- Given waktu habis, when saya belum submit, then sistem men-submit otomatis dan menolak jawaban yang masuk setelahnya.

**US-2. Sebagai player, saya ingin melihat hasil dan pembahasan setelah selesai.**

- Given saya sudah submit, when halaman hasil dibuka, then skor, jawaban benar, dan pembahasan tampil.
- Given saya belum submit, when saya meminta pembahasan lewat API, then server menolak (403).

**US-3. Sebagai creator, saya ingin membuat kuis dan menerbitkannya.**

- Given kuis punya minimal 1 soal dan tiap soal punya tepat satu jawaban benar, when saya menekan Terbitkan, then status menjadi published dan kuis muncul di katalog.
- Given ada soal tanpa jawaban benar, when saya menekan Terbitkan, then sistem menampilkan pesan kesalahan yang spesifik.

**US-4. Sebagai pengguna, data saya tidak boleh dibaca pengguna lain.**

- Given pengguna A login, when A meminta attempt milik B, then hasilnya kosong atau ditolak (diuji otomatis).

**US-5. Sebagai admin, saya ingin menurunkan kuis yang melanggar.**

- Given kuis dilaporkan, when admin menekan Tangguhkan, then kuis hilang dari katalog dan kreator menerima pemberitahuan.

## 10. Alur Pengguna Utama

**Mengerjakan kuis:** Beranda → Katalog → Detail kuis → Mulai (login jika perlu) → Ruang kuis (jawab, autosave) → Submit → Hasil + pembahasan → Leaderboard.

**Membuat kuis:** Masuk → Dasbor kreator → Kuis baru (judul, kategori, durasi) → Tambah soal → Pratinjau → Terbitkan → Bagikan tautan.

**Moderasi:** Laporan masuk → Admin meninjau → Tangguhkan/biarkan → Catatan audit tersimpan.

## 11. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
| --- | --- |
| Performa | LCP < 2,5 dtk di 4G; p95 API baca < 300 ms; p95 submit < 800 ms |
| Skalabilitas | Mendukung 500 pengguna bersamaan pada MVP tanpa perubahan arsitektur; jalur peningkatan jelas sampai ribuan |
| Ketersediaan | Uptime ≥ 99,5%; RPO ≤ 24 jam; RTO ≤ 2 jam |
| Keamanan | RLS aktif di semua tabel; OWASP Top 10 dimitigasi; secret tidak pernah di klien |
| Privasi | Data minimum; hapus akun; kebijakan privasi dan syarat layanan |
| Aksesibilitas | Navigasi keyboard, kontras warna memadai, label form, target sentuh ≥ 44 px |
| Kompatibilitas | Dua versi terbaru Chrome, Safari, Firefox, Edge; Android dan iOS |
| Keterpeliharaan | TypeScript ketat, cakupan tes untuk logika penilaian ≥ 80%, migrasi database berversi |
| Observabilitas | Error terlacak, log terstruktur, alert aktif |

## 12. Arsitektur dan Tech Stack

| Area | Keputusan |
| --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form + Zod; ISR untuk katalog dan detail kuis |
| API dan logika backend | Route Handlers/Server Actions; validasi Zod; penilaian dan timer di server; fungsi SQL (RPC) untuk operasi atomik |
| Database dan storage | Supabase PostgreSQL (region Singapura); Supabase Storage untuk gambar soal dan avatar |
| Auth dan izin | Supabase Auth (email, Google, magic link); role di tabel profiles; sesi cookie httpOnly |
| Hosting dan deployment | Vercel (web + API); Supabase (data); domain via Cloudflare DNS; lingkungan local, staging, production |
| Cloud dan compute | Serverless Vercel Functions; middleware di edge; Vercel/Supabase Cron untuk tugas terjadwal; Resend untuk email; worker terpisah jika perlu (impor/ekspor besar, live quiz) |
| CI/CD dan version control | GitHub; branch main dan develop; GitHub Actions: lint, typecheck, test, build, e2e; deploy otomatis; migrasi lewat Supabase CLI |
| Keamanan dan RLS | RLS di semua tabel; kunci jawaban terpisah; header keamanan; sanitasi input; Turnstile pada form sensitif |
| Rate limiting | Upstash Redis + @upstash/ratelimit di middleware |
| Caching dan CDN | Vercel Edge Network; ISR; cache Redis untuk leaderboard dan kategori; Cache-Control dengan stale-while-revalidate |
| Load balancing dan scaling | Autoscaling serverless Vercel; Supavisor (pooler koneksi); jalur: naikkan instance DB → read replica → layanan realtime/antrean terpisah |
| Error tracking dan log | Sentry; log JSON dengan request\_id; Vercel dan Supabase Logs; UptimeRobot atau Better Stack |
| Availability dan recovery | Backup harian + PITR; pg\_dump terjadwal ke penyimpanan terpisah; rollback Vercel; runbook insiden; uji restore tiap kuartal |

## 13. Model Data

| Tabel | Kolom utama |
| --- | --- |
| profiles | id (= auth.users.id), username (unik), avatar\_url, role, created\_at |
| categories | id, nama, slug |
| quizzes | id, owner\_id, judul, deskripsi, category\_id, kesulitan, durasi\_detik, status (draft/published/suspended), visibilitas (public/unlisted/private), acak\_soal, maks\_percobaan, created\_at, published\_at |
| questions | id, quiz\_id, teks, tipe, gambar\_url, bobot, urutan, pembahasan |
| options | id, question\_id, teks, urutan |
| question\_keys | question\_id, option\_id (jawaban benar); tanpa akses klien |
| attempts | id, quiz\_id, user\_id, started\_at, expires\_at, submitted\_at, skor, persentase, status (in\_progress/submitted/expired) |
| attempt\_answers | attempt\_id, question\_id, option\_id, benar, answered\_at |
| reports | id, quiz\_id, reporter\_id, alasan, status, created\_at |
| audit\_logs | id, actor\_id, aksi, target, metadata, created\_at |

**Indeks:** quizzes(status, category\_id, published\_at desc); attempts(user\_id, started\_at desc); attempts(quiz\_id, skor desc, durasi); attempt\_answers(attempt\_id).

**Aturan integritas:** satu attempt in\_progress per pengguna per kuis; attempt\_answers unik per (attempt\_id, question\_id); kuis terbit tidak boleh diubah struktur soalnya tanpa membuat versi baru atau menutup percobaan aktif.

## 14. Kontrak API (ringkas)

| Metode dan jalur | Fungsi | Akses |
| --- | --- | --- |
| GET /api/quizzes | Daftar kuis (filter, pencarian, paginasi) | Publik |
| GET /api/quizzes/:id | Detail kuis dan soal tanpa kunci | Publik |
| POST /api/attempts | Mulai percobaan | Login/tamu |
| PUT /api/attempts/:id/answers | Simpan jawaban (autosave) | Pemilik attempt |
| POST /api/attempts/:id/submit | Submit dan nilai | Pemilik attempt |
| GET /api/attempts/:id/result | Hasil dan pembahasan | Pemilik, setelah submit |
| GET /api/quizzes/:id/leaderboard | Peringkat kuis | Publik |
| GET /api/me/attempts | Riwayat | Login |
| POST/PATCH/DELETE /api/creator/quizzes | Kelola kuis | Creator (pemilik) |
| POST /api/creator/quizzes/:id/publish | Terbitkan | Creator (pemilik) |
| POST /api/reports | Laporkan kuis | Login |
| PATCH /api/admin/quizzes/:id/suspend | Tangguhkan kuis | Admin |

**Konvensi:** JSON; kode status standar (400 validasi, 401, 403, 404, 409 konflik percobaan aktif, 429 rate limit); semua respons error memuat kode dan pesan yang konsisten serta request\_id.

## 15. Keamanan, RLS, dan Anti-Curang

**Kebijakan RLS:**

- quizzes: select untuk semua jika status published dan visibilitas public, atau jika pemilik; insert/update/delete hanya pemilik; admin lewat fungsi khusus.
- questions dan options: select mengikuti kuis induknya; tulis hanya pemilik kuis.
- question\_keys: tanpa policy untuk klien; diakses hanya lewat service role di server.
- attempts dan attempt\_answers: select/insert/update hanya jika user\_id = auth.uid(); jawaban tidak dapat diubah setelah submit.
- profiles: baca terbatas (username dan avatar publik); ubah hanya milik sendiri; kolom role tidak dapat diubah klien.

**Ancaman utama dan mitigasi:**

| Ancaman | Mitigasi |
| --- | --- |
| Mengintip jawaban lewat DevTools | Kunci terpisah, penilaian server |
| Memanipulasi timer | Waktu server dan expires\_at |
| Pengiriman jawaban massal/bot | Rate limit, Turnstile, deteksi submit terlalu cepat |
| XSS lewat teks soal | Sanitasi dan CSP |
| Akses data pengguna lain (IDOR) | RLS dan tes otomatis lintas pengguna |
| Unggah file berbahaya | Validasi tipe dan ukuran, nama file acak |
| Kebocoran secret | Env var, rotasi berkala, secret scanning di GitHub |
| Eskalasi role | Role hanya diubah server/admin |

## 16. Rate Limiting, Caching, dan Skala

| Endpoint | Batas awal | Kunci |
| --- | --- | --- |
| Login, daftar, reset password | 5-10 per menit | IP |
| Mulai percobaan | 10 per menit | Pengguna |
| Simpan jawaban | 60 per menit | Pengguna |
| Submit | 5 per menit | Pengguna |
| Unggah gambar | 20 per jam | Pengguna |
| API publik | 100 per menit | IP |

**Caching:** katalog dan detail kuis lewat ISR dengan revalidasi saat kuis diterbitkan atau diubah; leaderboard di Redis (TTL 30-60 detik); daftar kategori di Redis; data pribadi dan sesi kuis aktif tidak pernah di-cache.

**Skala bertahap:** (1) MVP serverless + pooler; (2) instance database lebih besar, read replica, tabel agregat statistik; (3) live quiz dengan layanan realtime terpisah, antrean penulisan jawaban, worker khusus. Uji beban dengan k6 sebelum kuis besar.

## 17. Observabilitas, Ketersediaan, dan Pemulihan

- **Pelacakan error:** Sentry untuk frontend dan backend dengan source map.
- **Log:** JSON terstruktur (request\_id, endpoint, durasi, status); tanpa password, token, atau jawaban kuis.
- **Alert:** error rate > 2% selama 5 menit, situs tidak dapat diakses, koneksi DB > 80%, lonjakan 429.
- **Backup:** harian dan PITR; salinan pg\_dump independen; retensi minimal 30 hari.
- **Pemulihan:** rollback Vercel; migrasi backward compatible; runbook untuk DB down, deploy gagal, kebocoran key; latihan restore tiap kuartal.
- **Degradasi halus:** jika Redis atau leaderboard gagal, kuis tetap berjalan dengan cache lama atau fitur disembunyikan.
- **Komunikasi:** halaman status dan pengumuman maintenance di luar jam ramai.

## 18. CI/CD dan Alur Rilis

1. Pengembang membuat branch feature/\* dan membuka Pull Request.
2. GitHub Actions menjalankan lint, typecheck, unit test, build, dan e2e (Playwright: alur ikut kuis).
3. Review minimal satu orang; branch protection di main.
4. Merge ke develop → deploy staging; uji akseptasi.
5. Merge ke main → deploy production; migrasi database dijalankan otomatis setelah tes lulus.
6. Pascarilis: pantau Sentry dan metrik selama 30 menit; rollback bila error rate melonjak.

## 19. Desain UI/UX

**Peta situs:** Beranda · Katalog · Detail kuis · Ruang kuis · Hasil · Leaderboard · Masuk/Daftar · Profil dan riwayat · Dasbor kreator · Editor kuis · Statistik kuis · Admin (kuis, pengguna, laporan) · Halaman statis (Tentang, Privasi, Syarat).

**Prinsip:** mobile-first; satu soal per layar di HP; tombol besar; progres jelas; mode gelap; skeleton loading; pesan error yang ramah dan spesifik; animasi hemat dan menghormati preferensi reduce motion.

## 20. Analitik dan Event

Event yang dilacak (tanpa data pribadi sensitif): view\_catalog, view\_quiz, start\_attempt, answer\_saved, submit\_attempt, abandon\_attempt, create\_quiz, publish\_quiz, signup, login, report\_quiz. Dasbor: funnel mulai → submit, kuis terpopuler, titik berhenti pemain, soal dengan tingkat salah tertinggi.

## 21. Roadmap dan Milestone

| Periode | Milestone | Hasil |
| --- | --- | --- |
| Minggu 1-2 | Fondasi | Repo, CI, skema DB + RLS, auth, deploy staging |
| Minggu 3-4 | Inti pemain | Katalog, ruang kuis, penilaian server, hasil |
| Minggu 5 | Kreator | Editor kuis, unggah gambar, pratinjau dan terbit |
| Minggu 6 | Penguatan | Leaderboard, rate limit, cache, Sentry, uptime monitor, moderasi dasar |
| Minggu 7 | Kesiapan rilis | Uji beban, uji RLS lintas pengguna, latihan restore, perbaikan aksesibilitas |
| Minggu 8 | Beta tertutup | 20-50 pengguna uji, kumpulkan umpan balik |
| Setelah beta | v1.1 dan v1.2 | Kuis privat, kelas, impor CSV, kuis live |

## 22. Risiko dan Mitigasi

| Risiko | Kemungkinan | Dampak | Mitigasi |
| --- | --- | --- | --- |
| Kecurangan merusak kepercayaan peringkat | Tinggi | Tinggi | Penilaian server, timer server, deteksi anomali |
| Kebocoran data karena RLS salah | Sedang | Sangat tinggi | Tes RLS otomatis, review policy, prinsip tutup-dulu |
| Konten melanggar atau SARA | Sedang | Tinggi | Pelaporan, moderasi, syarat layanan jelas |
| Koneksi DB habis saat lonjakan | Sedang | Tinggi | Pooler, cache, uji beban |
| Biaya membengkak | Sedang | Sedang | Batas penggunaan, alert biaya, cache agresif |
| Batas tier gratis tercapai | Sedang | Sedang | Pantau kuota, rencana upgrade bertahap |
| Kehilangan data | Rendah | Sangat tinggi | Backup berlapis, uji restore |
| Kreator sedikit sehingga katalog sepi | Sedang | Tinggi | Kuis awal dari tim, ajak guru dan komunitas, template kuis |

## 23. Asumsi, Dependensi, dan Pertanyaan Terbuka

**Asumsi:** pengguna utama mengakses lewat HP; MVP cukup dengan satu region; volume awal di bawah 500 pengguna bersamaan.

**Dependensi:** Supabase, Vercel, Upstash, Resend, Sentry, Cloudflare (DNS dan Turnstile), Google OAuth.

**Pertanyaan terbuka:**

1. Apakah tamu boleh mengerjakan kuis tanpa login, dan apakah skornya disimpan?
2. Apakah creator perlu persetujuan admin sebelum bisa menerbitkan kuis publik?
3. Berapa maksimum soal per kuis dan ukuran gambar per soal?
4. Apakah soal dapat diedit setelah kuis dikerjakan banyak orang (versi soal)?
5. Apakah pembahasan boleh tampil setelah percobaan terakhir saja untuk kuis yang dapat diulang?
6. Nama final dan domain (lihat lampiran).

## 24. Lampiran

**Kandidat nama:** KuisKita (utama) · TanyaKita · UjiKita · KuisBareng · Kuizzo · Kuisin · Jawabin · Cerdika · QuizNesia · KuisNusa. Periksa ketersediaan domain, akun media sosial, dan kemungkinan bentrok merek sebelum memutuskan.

**Glosarium:**

| Istilah | Arti |
| --- | --- |
| RLS | Row Level Security, aturan akses per baris di PostgreSQL |
| ISR | Incremental Static Regeneration, halaman statis yang diperbarui berkala |
| RPO/RTO | Batas kehilangan data / batas waktu pemulihan yang dapat diterima |
| PITR | Point-in-Time Recovery, pemulihan database ke titik waktu tertentu |
| Attempt | Satu percobaan pengguna mengerjakan sebuah kuis |
